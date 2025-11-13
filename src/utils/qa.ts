import {
  EnvBindings,
  QA_RUN_HISTORY_LIMIT,
  listLeadReminders,
  listLeads,
  listPaymentReminders,
  listProjects,
  listQaRuns,
  listReportSchedules,
  saveQaRuns,
  saveReportSchedules,
} from "./storage";
import { createId } from "./ids";
import { calculateNextRunAt } from "./report-scheduler";
import {
  LeadRecord,
  LeadReminderRecord,
  PaymentReminderRecord,
  ProjectRecord,
  QaIssueRecord,
  QaRunRecord,
  ReportScheduleRecord,
} from "../types";

export interface QaEvaluationInput {
  projects: ProjectRecord[];
  leads: LeadRecord[];
  leadReminders: LeadReminderRecord[];
  paymentReminders: PaymentReminderRecord[];
  schedules: ReportScheduleRecord[];
  now?: Date;
}

export interface QaEvaluationResult {
  schedules: ReportScheduleRecord[];
  scheduleIssues: number;
  scheduleRescheduled: number;
  leadReminderIssues: number;
  paymentReminderIssues: number;
  projectIssueIds: string[];
  issues: QaIssueRecord[];
}

const cloneSchedule = (schedule: ReportScheduleRecord): ReportScheduleRecord => ({
  ...schedule,
  projectIds: [...(schedule.projectIds ?? [])],
  weekdays: schedule.weekdays ? [...schedule.weekdays] : undefined,
});

export const evaluateQaDataset = ({
  projects,
  leads,
  leadReminders,
  paymentReminders,
  schedules,
  now = new Date(),
}: QaEvaluationInput): QaEvaluationResult => {
  const projectMap = new Map(projects.map((project) => [project.id, project]));
  const leadMap = new Map(leads.map((lead) => [lead.id, lead]));
  const scheduleCopies = schedules.map((schedule) => cloneSchedule(schedule));
  const issues: QaIssueRecord[] = [];
  const projectsWithIssues = new Set<string>();
  const nowMs = now.getTime();

  let scheduleIssues = 0;
  let scheduleRescheduled = 0;

  for (const schedule of scheduleCopies) {
    let hasIssue = false;
    const missingProjects = (schedule.projectIds ?? []).filter((id) => !projectMap.has(id));
    if (missingProjects.length) {
      hasIssue = true;
      missingProjects.forEach((projectId) => {
        projectsWithIssues.add(projectId);
        issues.push({
          type: "schedule",
          referenceId: schedule.id,
          projectId,
          message: `Расписание ${schedule.id} ссылается на отсутствующий проект ${projectId}.`,
        });
      });
    }

    const nextRun = schedule.nextRunAt ? Date.parse(schedule.nextRunAt) : Number.NaN;
    if (!schedule.nextRunAt || Number.isNaN(nextRun) || nextRun <= nowMs) {
      const calculated = calculateNextRunAt(schedule, now);
      if (schedule.nextRunAt !== calculated) {
        schedule.nextRunAt = calculated;
        schedule.updatedAt = now.toISOString();
        scheduleRescheduled += 1;
      }
      const parsed = Date.parse(schedule.nextRunAt ?? calculated);
      if (Number.isNaN(parsed) || parsed <= nowMs) {
        hasIssue = true;
        issues.push({
          type: "schedule",
          referenceId: schedule.id,
          message: `Расписание ${schedule.id} имеет некорректное время запуска (${schedule.nextRunAt ?? "unknown"}).`,
        });
      }
    }

    if (hasIssue) {
      scheduleIssues += 1;
    }
  }

  let leadReminderIssues = 0;
  for (const reminder of leadReminders) {
    let hasIssue = false;
    const lead = leadMap.get(reminder.leadId);
    if (!lead) {
      hasIssue = true;
      issues.push({
        type: "lead-reminder",
        referenceId: reminder.id,
        projectId: reminder.projectId,
        message: `Напоминание по лиду ${reminder.id} ссылается на отсутствующий лид ${reminder.leadId}.`,
      });
    } else if (lead.projectId !== reminder.projectId) {
      hasIssue = true;
      projectsWithIssues.add(lead.projectId);
      issues.push({
        type: "lead-reminder",
        referenceId: reminder.id,
        projectId: reminder.projectId,
        message: `Лид ${lead.id} принадлежит проекту ${lead.projectId}, но напоминание привязано к ${reminder.projectId}.`,
      });
    }

    if (!projectMap.has(reminder.projectId)) {
      hasIssue = true;
      projectsWithIssues.add(reminder.projectId);
      issues.push({
        type: "lead-reminder",
        referenceId: reminder.id,
        projectId: reminder.projectId,
        message: `Напоминание по лиду ${reminder.id} ссылается на отсутствующий проект ${reminder.projectId}.`,
      });
    }

    if (hasIssue) {
      leadReminderIssues += 1;
    }
  }

  let paymentReminderIssues = 0;
  for (const reminder of paymentReminders) {
    if (!projectMap.has(reminder.projectId)) {
      paymentReminderIssues += 1;
      projectsWithIssues.add(reminder.projectId);
      issues.push({
        type: "payment-reminder",
        referenceId: reminder.id,
        projectId: reminder.projectId,
        message: `Платёжное напоминание ${reminder.id} ссылается на отсутствующий проект ${reminder.projectId}.`,
      });
    }
  }

  return {
    schedules: scheduleCopies,
    scheduleIssues,
    scheduleRescheduled,
    leadReminderIssues,
    paymentReminderIssues,
    projectIssueIds: Array.from(projectsWithIssues),
    issues,
  };
};

export const runRegressionChecks = async (env: EnvBindings): Promise<QaRunRecord> => {
  const startedAt = Date.now();
  const [projects, leadReminders, paymentReminders, schedules] = await Promise.all([
    listProjects(env),
    listLeadReminders(env),
    listPaymentReminders(env),
    listReportSchedules(env),
  ]);

  const leadsNested = await Promise.all(
    projects.map((project) => listLeads(env, project.id).catch(() => [] as LeadRecord[])),
  );
  const leads = leadsNested.flat();

  const evaluation = evaluateQaDataset({
    projects,
    leads,
    leadReminders,
    paymentReminders,
    schedules,
    now: new Date(startedAt),
  });

  if (evaluation.scheduleRescheduled > 0) {
    await saveReportSchedules(env, evaluation.schedules);
  }

  const finishedAt = Date.now();
  const record: QaRunRecord = {
    id: `qa_${createId(12)}`,
    createdAt: new Date(startedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    checks: {
      projects: {
        total: projects.length,
        invalid: evaluation.projectIssueIds.length,
      },
      reportSchedules: {
        total: schedules.length,
        invalid: evaluation.scheduleIssues,
        rescheduled: evaluation.scheduleRescheduled,
      },
      leadReminders: {
        total: leadReminders.length,
        invalid: evaluation.leadReminderIssues,
      },
      paymentReminders: {
        total: paymentReminders.length,
        invalid: evaluation.paymentReminderIssues,
      },
    },
    issues: evaluation.issues,
  };

  const previous = await listQaRuns(env).catch(() => [] as QaRunRecord[]);
  const next = [record, ...previous];
  if (next.length > QA_RUN_HISTORY_LIMIT) {
    next.length = QA_RUN_HISTORY_LIMIT;
  }
  await saveQaRuns(env, next);

  return record;
};
