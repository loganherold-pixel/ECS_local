import {
  createECSDiagnosticToken as createTokenCore,
  fingerprintECSDiagnosticValue as fingerprintCore,
  sanitizeECSDiagnosticText as sanitizeTextCore,
  sanitizeECSDiagnosticValue as sanitizeValueCore,
} from './ecsDiagnosticRedactionCore';

export type ECSDiagnosticPrimitive = string | number | boolean | null;
export type ECSDiagnosticValue =
  | ECSDiagnosticPrimitive
  | ECSDiagnosticValue[]
  | { [key: string]: ECSDiagnosticValue };

export type ECSDiagnosticRedactionOptions = {
  maxDepth?: number;
  maxArrayLength?: number;
  maxObjectKeys?: number;
  maxStringLength?: number;
};

export function createECSDiagnosticToken(prefix: string, value: unknown): string | null {
  return createTokenCore(prefix, value) as string | null;
}

export function sanitizeECSDiagnosticText(value: string, maxLength?: number): string {
  return sanitizeTextCore(value, maxLength) as string;
}

export function sanitizeECSDiagnosticValue<T = unknown>(
  value: T,
  options: ECSDiagnosticRedactionOptions = {},
): T {
  return sanitizeValueCore(value, options) as T;
}

export function fingerprintECSDiagnosticValue(value: unknown): string {
  return fingerprintCore(value) as string;
}
