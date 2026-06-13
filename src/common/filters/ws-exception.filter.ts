import { Catch, ArgumentsHost, Logger, HttpException } from "@nestjs/common";
import {BaseWsExceptionFilter, WsException} from "@nestjs/websockets";
import {Socket} from "socket.io";

@Catch()
export class WsExpectionFilter extends BaseWsExceptionFilter {
    private readonly logger = new Logger(WsExpectionFilter.name);

    catch(exception: unknown, host: ArgumentsHost) {
      const client = host.switchToWs().getClient<Socket>();
      const data = host.switchToWs().getData();

      let message = 'Websocket errro';
      let code = 'INTERNAL_ERROR';
      let status = 500;

      if (exception instanceof WsException) {
        const wsResponse = exception.getError();
        if (typeof wsResponse === 'string') {
          message = wsResponse;
        } else if (typeof wsResponse === 'object' && wsResponse !== null) {
          const resp = wsResponse as Record<string, any>;
          message = resp.message || message;
          code = resp.code || code;
          status = resp.status || status;
        }
      } else if (exception instanceof HttpException) {
        status = exception.getStatus();
        const httpResponse = exception.getResponse();
        if (typeof httpResponse === 'string') {
          message = httpResponse;
        } else if (typeof httpResponse === 'object' && httpResponse !== null) {
          const resp = httpResponse as Record<string, any>;
          message = resp.message || exception.message;
        }
        code = `HTTP_${status}`;
      } else if (exception instanceof Error) {
        message = exception.message;
        code = 'UNEXPECTED_ERROR';
        this.logger.error(
          `Unexpected WS error: ${exception.message}`,
          exception.stack,
        );
      }

      const errorPayload = {
        message: Array.isArray(message) ? message[0] : message,
        code,
        status,
        timestamp: new Date().toISOString(),
      };

      this.logger.warn(
        `WS Error [${code}] ${errorPayload.message} | data: ${JSON.stringify(data)}`,
      );

      client.emit('error', errorPayload);
    }
}
