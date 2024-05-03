import { IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '@prisma/client'; 
import { OrderStatusList } from '../enum';
import { PaginationDto } from 'src/common';

export class OrderPaginationDto extends PaginationDto {
  @IsOptional()
  @IsEnum(OrderStatusList, {
    message: `Possible status values are ${OrderStatusList}`,
  })
  status: OrderStatus;
}
