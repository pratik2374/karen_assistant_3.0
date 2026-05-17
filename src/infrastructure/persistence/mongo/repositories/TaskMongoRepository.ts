import { Db } from 'mongodb';
import { MongoRepository } from './MongoRepository';
import { TaskAggregate } from '../../../../domain/task/TaskAggregate';
import { TaskDocumentMapper, TaskMongoDocument } from '../mappers/TaskDocumentMapper';

export class TaskMongoRepository extends MongoRepository<TaskAggregate, TaskMongoDocument> {
  constructor(db: Db) {
    super(db, 'aggregates_tasks', new TaskDocumentMapper());
  }
}
