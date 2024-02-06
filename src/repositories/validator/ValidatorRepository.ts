import { IValidator } from "@database/models/validator/validator.interface";
import ValidatorDbModel from "@database/models/validator/validator.model";
import BaseRepository from "@repositories/base.repository";

export class ValidatorRepository extends BaseRepository<IValidator> {
  constructor() {
    super(ValidatorDbModel);
  }
}
