import { OrderStatus } from "@prisma/client";
import { IsEnum, IsUUID } from "class-validator";
import { OrderStatusList } from "../enum";

export class ChangeOrderStatusDto { 

    @IsUUID(4)
    id: string;

    @IsEnum(OrderStatusList, {
        message: `Possible values by status are ${OrderStatusList}`
    })
    status: OrderStatus;

}