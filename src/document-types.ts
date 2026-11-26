export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue | undefined };

export interface Entity {
  name: string;
  dependencies: string[];
  description?: string;
  [key: string]: JsonValue | undefined;
}

export interface DependencyDocument {
  entities: Entity[];
  [key: string]: JsonValue | undefined;
}

export interface GraphEntity {
  name: string;
  description?: string;
  dependencies: string[];
  documented: boolean;
  extras?: [string, JsonValue | undefined][];
}

export interface Graph {
  entities: GraphEntity[];
  edges: { source: string; target: string }[];
}
