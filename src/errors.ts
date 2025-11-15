export class EntityNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} with id '${id}' was not found`);
    this.name = "EntityNotFoundError";
  }
}

export class DataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataValidationError";
  }
}
