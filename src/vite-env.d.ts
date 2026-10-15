/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPWRITE_ENDPOINT?: string;
  readonly VITE_APPWRITE_PROJECT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// ============================================================
// Tillfälliga deklarationer för att eliminera byggfel
// under utveckling av auth-lagret. Dessa tas bort när
// appwrite-Modulet installeras och de faktiska typerna
// importeras.
// ============================================================

declare module 'appwrite' {
  export interface Client {
    setEndpoint(url: string): this;
    setProject(id: string): this;
    setKey(key: string): this;
    setSession(session: string): this;
  }

  export interface Account {
    create(options: {
      userId: string;
      email?: string;
      password: string;
      name?: string;
    }): Promise<any>;
    createEmailPasswordSession(options: {
      email: string;
      password: string;
    }): Promise<{ session: string; secret: string }>;
    createSession(options: { userId: string; secret: string }): Promise<any>;
    get(): Promise<any>;
    deleteSession(options: { sessionId: string }): Promise<any>;
  }

  export interface TablesDB {
    create(options: { databaseId: string; name: string }): Promise<any>;
    createTable(options: {
      databaseId: string;
      tableId: string;
      name: string;
    }): Promise<any>;
    createRow(options: {
      databaseId: string;
      tableId: string;
      rowId: string;
      data: any;
    }): Promise<any>;
    listRows(options: {
      databaseId: string;
      tableId: string;
      queries?: any[];
    }): Promise<any>;
    getRow(options: {
      databaseId: string;
      tableId: string;
      rowId: string;
    }): Promise<any>;
    updateRow(options: {
      databaseId: string;
      tableId: string;
      rowId: string;
      data: any;
    }): Promise<any>;
    deleteRow(options: {
      databaseId: string;
      tableId: string;
      rowId: string;
    }): Promise<any>;
  }

  export interface Storage {
    createFile(options: {
      bucketId: string;
      fileId: string;
      file: File;
    }): Promise<any>;
    listFiles(options: { bucketId: string }): Promise<any>;
    getFilePreview(options: {
      bucketId: string;
      fileId: string;
      width?: number;
      height?: number;
    }): string;
    getFileDownload(options: {
      bucketId: string;
      fileId: string;
    }): Promise<any>;
    deleteFile(options: { bucketId: string; fileId: string }): Promise<any>;
  }

  export interface ID {
    unique(): string;
  }

  export interface Query {
    equal(field: string, value: any): any;
    notEqual(field: string, value: any): any;
    lessThan(field: string, value: number): any;
    lessThanEqual(field: string, value: number): any;
    greaterThan(field: string, value: number): any;
    greaterThanEqual(field: string, value: number): any;
    between(field: string, min: number, max: number): any;
    isNull(field: string): any;
    isNotNull(field: string): any;
    startsWith(field: string, prefix: string): any;
    endsWith(field: string, suffix: string): any;
    contains(field: string, value: any): any;
    search(field: string, keywords: string): any;
    orderAsc(field: string): any;
    orderDesc(field: string): any;
    limit(limit: number): any;
    offset(offset: number): any;
    cursorAfter(cursor: string): any;
    cursorBefore(cursor: string): any;
    select(fields: string[]): any;
    or(queries: any[]): any;
    and(queries: any[]): any;
  }

  export class AppwriteException {
    constructor(message: string);
    message: string;
    code: number;
    type: string;
    response: any;
  }

  export interface Models {
    User: any;
    Session: any;
    File: any;
    Team: any;
    Execution: any;
    DocumentList: any;
  }

  export interface Permission {
    read(role: any): string;
    update(role: any): string;
    delete(role: any): string;
    create(role: any): string;
    write(role: any): string;
  }

  export interface Role {
    user(userId: string): string;
    team(teamId: string, role?: string): string;
    any(): string;
  }

  export const Client: any;
  export const Account: any;
  export const TablesDB: any;
  export const Storage: any;
  export const Teams: any;
  export const Functions: any;
  export const ID: any;
  export const Query: any;
  export const Permission: any;
  export const Role: any;
}

// ============================================================
// Fönster-utökningar för demo-kopieringsstatus
// ============================================================

interface Window {
  __VAUX_COPIED_CODE?: string;
  __VAUX_DEMO_INIT_CODE?: string;
}
