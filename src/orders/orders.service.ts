import {
  Injectable,
  OnModuleInit,
  Logger,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { CreateOrderDto, OrderPaginationDto, PaidOrderDto } from './dto';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { ChangeOrderStatusDto } from './dto/change-order-status.dto';
import { NATS_SERVICE } from 'src/config';
import { firstValueFrom } from 'rxjs';
import { OrderWithProducts } from './interfaces/order-with-produts.interface';

@Injectable()
export class OrdersService extends PrismaClient implements OnModuleInit {
  private readonly logger: Logger = new Logger('OrdersService');

  constructor(
    //@Inject(PRODUCT_SERVICE) private readonly productsClient: ClientProxy,
    @Inject(NATS_SERVICE) private readonly client: ClientProxy,
  ) {
    super();
  }

  onModuleInit() {
    this.logger.log(`Database connected.`);
  }

  async create(createOrderDto: CreateOrderDto) {
    const productsIds: number[] = createOrderDto.items.map((p) => p.productId);

    // call service products
    const products: any[] = await this.getProducts(productsIds);

    try {
      // acumulador totalAmount
      const totalAmount = createOrderDto.items.reduce((acc, orderItem) => {
        const price = products.find((p) => p.id === orderItem.productId).price;
        return acc + price * orderItem.quantity;
      }, 0);

      // acumulador totalItems
      const totalItems = createOrderDto.items.reduce((acc, orderItem) => {
        return acc + orderItem.quantity;
      }, 0);

      // create order in database
      // Si las tablas no estan relacionadas se debe usar transaction

      const order = await this.order.create({
        data: {
          totalAmount: totalAmount,
          totalItems: totalItems,
          // relation tables
          OrderItem: {
            createMany: {
              data: createOrderDto.items.map((orderItem) => {
                return {
                  price: products.find((p) => p.id === orderItem.productId)
                    .price,
                  quantity: orderItem.quantity,
                  productId: orderItem.productId,
                };
              }),
            },
          },
        },
        // include: trae las tabla relacionada
        include: {
          // true: trae toda la data
          OrderItem: {
            select: {
              price: true,
              quantity: true,
              productId: true,
            },
          },
        },
      });

      // return response
      return {
        ...order,
        OrderItem: order.OrderItem.map((orderItem) => ({
          ...orderItem,
          name: products.find((p) => p.id === orderItem.productId).name,
        })),
      };
    } catch (error) {
      throw new RpcException({
        message: 'Persistencia en base de datos.',
        status: HttpStatus.INTERNAL_SERVER_ERROR,
      });
    }
  }

  async findAll(orderPaginationDto: OrderPaginationDto) {
    const totalRecords = await this.order.count({
      where: { status: orderPaginationDto.status },
    });

    const currentPage = orderPaginationDto.page;
    const perPage = orderPaginationDto.limit;

    return {
      data: await this.order.findMany({
        where: { status: orderPaginationDto.status },
        skip: (currentPage - 1) * perPage,
        take: perPage,
      }),
      meta: {
        total: totalRecords,
        currentPage,
        lastPage: Math.ceil(totalRecords / perPage),
      },
    };
  }

  async findOne(id: string) {
    const order = await this.order
      .findFirstOrThrow({
        where: { id },
        include: {
          // include table relations
          OrderItem: {
            select: {
              price: true,
              productId: true,
              quantity: true,
            },
          },
        },
      })
      .catch(() => {
        throw new RpcException({
          message: `Order with id ${id} not found.`,
          status: HttpStatus.NOT_FOUND,
        });
      });

    const productIds: number[] = order.OrderItem.map((p) => p.productId);
    const products: any[] = await this.getProducts(productIds);

    return {
      ...order,
      OrderItem: order.OrderItem.map((orderItem) => ({
        ...orderItem,
        name: products.find((p) => p.id === orderItem.productId).name,
      })),
    };
  }

  async changeStatus(changeOrderStatusDto: ChangeOrderStatusDto) {
    const { id, status } = changeOrderStatusDto;

    const order = await this.findOne(id);

    if (order.status === status) {
      return order;
    }

    return this.order.update({
      where: { id },
      data: { status: status },
    });
  }

  // call service products
  // return list products
  private async getProducts(productsIds: number[]) {
    try {
      const products: any[] = await firstValueFrom(
        this.client.send({ cmd: 'validate_products' }, productsIds),
      );
      return products;
    } catch (error) {
      throw new RpcException({
        message: error.message,
        status: HttpStatus.BAD_REQUEST,
      });
    }
  }

  //  ----- Payment Service ----
  async createPaymentSession(order: OrderWithProducts) {
    const paymentSession = await firstValueFrom(
      this.client.send('create.payment.session', {
        orderId: order.id,
        currency: 'usd',
        items: order.OrderItem.map((item) => ({
          name: item.name,
          price: item.price,
          quantity: item.quantity,
        })),
      }),
    );

    return paymentSession;
  }

  async paidOrder(paidOrderDto: PaidOrderDto) {
    this.logger.log('Order Paid');
    this.logger.log(paidOrderDto);

    const order = await this.order.update({
      where: { id: paidOrderDto.orderId },
      data: {
        status: 'PAID',
        paid: true,
        paidAt: new Date(),
        stripeChargeId: paidOrderDto.stripePaymentId,

        // Realation with Order - OrderReceipt
        OrderReceipt: {
          create: {
            receiptUrl: paidOrderDto.receiptUrl,
          },
        },
      },
    });

    return order;
  }
}
