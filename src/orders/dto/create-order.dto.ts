import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { OrderItemDto } from './order-item.dto';

export class CreateOrderDto {
  
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested() // validacion interna de los elmentos del tipo de objeto = OrderItemDto
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

// @IsNumber()
// @IsPositive()
// totalAmount: number;

// @IsNumber()
// @IsPositive()
// totalItems: number;

// @IsEnum(OrderStatusList, {
//   message: `Possible status values are ${OrderStatusList}`,
// })
// @IsOptional()
// status: OrderStatus = OrderStatus.PENDING;

// @IsBoolean()
// @IsOptional()
// paid: boolean = false;
