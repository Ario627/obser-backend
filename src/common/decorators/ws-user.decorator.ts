import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import {Socket} from 'socket.io';

export const WsUser = createParamDecorator(
    (data: string | undefined, ctx: ExecutionContext) => {
        const client = ctx.switchToWs().getClient<Socket>();
        const user = client.data.user;

        if(!user) return null;

        return data ? user[data] : user;
    },
)