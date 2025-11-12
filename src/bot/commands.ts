import type { Env } from '../core/types';
import { createLead } from '../core/db';
import { sendMessage } from './telegram';

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
  from?: { first_name?: string; id: number };
}

export async function handleStart(env: Env, message: TelegramMessage) {
  const greeting = `Привет, ${message.from?.first_name ?? 'друг'}!\nВыберите команду:\n/lead — оставить заявку\n/report — получить отчёт`;
  await sendMessage(env, message.chat.id, greeting);
}

export async function handleLead(env: Env, message: TelegramMessage) {
  const parts = (message.text ?? '').split(' ').slice(1);
  const name = parts[0] ?? 'Не указано';
  const contact = parts[1] ?? '—';
  await createLead(env, {
    name,
    contact,
    source: 'telegram',
    status: 'new'
  });
  await sendMessage(env, message.chat.id, 'Заявка принята. Менеджер свяжется с вами.');
}

export async function handleReport(env: Env, message: TelegramMessage) {
  await sendMessage(env, message.chat.id, 'Отчёты доступны в админ-панели.');
}

export async function handleUnknown(env: Env, message: TelegramMessage) {
  await sendMessage(env, message.chat.id, 'Неизвестная команда. Используйте /start для помощи.');
}
