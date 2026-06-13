import {Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger} from "@nestjs/common"
import {Observable, tap} from "rxjs"
import {Request, Response} from "express"

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const now = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const response = context.switchToHttp().getResponse();
          const statusCode = response.statusCode;
          const elapsed = Date.now() - now;
          this.logger.log(
            `${method} ${url} ${statusCode} ${elapsed}ms - ${ip} ${userAgent}`,
          );
        },
        error: (err) => {
          const elapsed = Date.now() - now;
          const status = err.status || 500;
          this.logger.error(
            `${method} ${url} ${status} ${elapsed}ms - ${err.message}`,
          );
        },
      }),
    );
  }
}