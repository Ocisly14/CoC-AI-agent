declare module "better-sqlite3" {
  export interface Statement {
    run: (...args: any[]) => { changes: number; lastInsertRowid: number };
    get: (...args: any[]) => any;
    all: (...args: any[]) => any[];
  }

  export interface Database {
    prepare: (sql: string) => Statement;
    exec: (sql: string) => void;
    pragma: (pragma: string) => any;
    transaction: <T>(fn: () => T) => () => T;
    close: () => void;
  }

  const BetterSqlite3: {
    new (path?: string): Database;
  };

  export default BetterSqlite3;
}
