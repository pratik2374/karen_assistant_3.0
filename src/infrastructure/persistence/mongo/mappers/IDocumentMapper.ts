export interface IMongoDocument {
  _id: string;
  __v: number; // Aggregate Version
  lastUpdatedAt: Date;
  schemaVersion: number;
}

export interface IDocumentMapper<TAggregate, TDocument extends IMongoDocument> {
  toDomain(document: TDocument): TAggregate;
  toDocument(aggregate: TAggregate): TDocument;
}
