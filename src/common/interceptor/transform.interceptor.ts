import { CallHandler,ExecutionContext, Injectable, NestInterceptor, StreamableFile } from "@nestjs/common";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";
import type { TransformedResponse } from "../types";

@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<
  T,
  TransformedResponse<T> | T
> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<TransformedResponse<T> | T> {
    return next.handle().pipe(
      map((data) => {
        if (this.shouldSkip(data)) return data as T;

        return {
          data,
          timestamp: new Date().toISOString(),
          success: true,
        };
      })
    )
  }

  private shouldSkip(data: unknown): boolean {
    if (data === null || data === undefined) return true;
    if (data instanceof StreamableFile) return true;
    if (data instanceof Buffer) return true;
    if (typeof data === 'string') return true;

    if (typeof data === 'object' && data !== null) {
      const response = data as Record<string, unknown>;

      if (
        typeof response.success === 'boolean' &&
        typeof response.timestamp === 'string' &&
        'data' in response
      ) {
        return true;
      }
    }

    return false;
  }
}