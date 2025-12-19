import { Body, Controller, Get, HttpStatus, Post, Query, Render, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PaymentService } from './payment.service';

@Controller('payment')
export class PaymentController {
    constructor(private readonly paymentService: PaymentService) {}

    @Get('result')
    @Render('payment/result')
    async getResultPage(@Query() query: any) {
        const isSuccess = query.resultCode == '0';

        // You can also verify the signature and check the order status using the paymentService.checkTransactionStatus() function in the database before returning the data.
        return {
            isSuccess: isSuccess,
            message: query.message,
            transId: query.transId,
            orderInfo: query.orderInfo,
            amount: query.amount,
        };
    }

    @Post('checkout')
    async checkout(@Body() body: { amount: number; orderId: string }) {
        return await this.paymentService.createPayment(body.amount, body.orderId);
    }

    @Post('ipn')
    async callback(@Body() body: any, @Res() res: Response) {
        try {
            const result = this.paymentService.verifyIpnSignature(body);

            // if (result.status === 'SUCCESS') -> Update Order = PAID

            // Momo requires returning status 204 to confirm receipt
            return res.status(HttpStatus.NO_CONTENT).send();
        } catch (error) {
            console.error('IPN Error:', error.message);
            return res.status(HttpStatus.BAD_REQUEST).send();
        }
    }

    @Post('check-transaction-status')
    async checkTransactionStatus(@Body() body: { orderId: string }) {
        return await this.paymentService.checkTransactionStatus(body.orderId, body.orderId);
    }
}
