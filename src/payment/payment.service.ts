import {
    HttpException,
    HttpStatus,
    Injectable,
    InternalServerErrorException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

@Injectable()
export class PaymentService {
    private readonly config: any;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.config = {
            partnerCode: this.configService.get<string>('MOMO_PARTNER_CODE'),
            accessKey: this.configService.get<string>('MOMO_ACCESS_KEY'),
            secretKey: this.configService.get<string>('MOMO_SECRET_KEY'),
            ipnUrl: this.configService.get<string>('MOMO_IPN_URL'),
            redirectUrl: this.configService.get<string>('MOMO_REDIRECT_URL'),
        };
    }

    async createPayment(amount: number, orderId: string) {
        const { partnerCode, accessKey, secretKey, ipnUrl, redirectUrl } = this.config;

        const endpoint = 'https://test-payment.momo.vn/v2/gateway/api/create';
        const requestId = orderId;
        const orderInfo = 'Thanh toan don hang ' + orderId;
        const requestType = 'captureWallet';
        const extraData = '';

        // Format: accessKey=$accessKey&amount=$amount&extraData=$extraData&ipnUrl=$ipnUrl&orderId=$orderId&orderInfo=$orderInfo&partnerCode=$partnerCode&redirectUrl=$redirectUrl&requestId=$requestId&requestType=$requestType
        const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&ipnUrl=${ipnUrl}&orderId=${orderId}&orderInfo=${orderInfo}&partnerCode=${partnerCode}&redirectUrl=${redirectUrl}&requestId=${requestId}&requestType=${requestType}`;

        const signature = crypto.createHmac('sha256', secretKey).update(rawSignature).digest('hex');

        const requestBody = {
            partnerCode,
            accessKey,
            requestId,
            amount,
            orderId,
            orderInfo,
            redirectUrl,
            ipnUrl,
            extraData,
            requestType,
            signature,
            lang: 'vi',
        };

        try {
            const response = await firstValueFrom(this.httpService.post(endpoint, requestBody));
            return response.data;
        } catch (error) {
            console.error(error);
            throw new HttpException('Momo Error', HttpStatus.BAD_REQUEST);
        }
    }

    // Handle IPN (Momo calls here)
    verifyIpnSignature(momoData: any) {
        const { secretKey } = this.config;
        const {
            partnerCode,
            accessKey,
            requestId,
            amount,
            orderId,
            orderInfo,
            orderType,
            transId,
            resultCode,
            message,
            payType,
            responseTime,
            extraData,
            signature,
        } = momoData;

        // Recreate signature from the received data to compare
        const rawSignature = `accessKey=${accessKey}&amount=${amount}&extraData=${extraData}&message=${message}&orderId=${orderId}&orderInfo=${orderInfo}&orderType=${orderType}&partnerCode=${partnerCode}&payType=${payType}&requestId=${requestId}&responseTime=${responseTime}&resultCode=${resultCode}&transId=${transId}`;

        const mySignature = crypto
            .createHmac('sha256', secretKey)
            .update(rawSignature)
            .digest('hex');

        if (mySignature !== signature) {
            throw new HttpException('Invalid Signature', HttpStatus.BAD_REQUEST);
        }

        // Check resultCode
        if (resultCode == 0) {
            return { status: 'SUCCESS', orderId, amount };
        } else {
            return { status: 'FAILED', orderId, message };
        }
    }

    async checkTransactionStatus(orderId: string, requestId: string) {
        /*

        // Find order by orderId from DB to get amount
        const order = await this.orderRepository.findOne({ where: { orderId } });

        if (!order) throw new NotFoundException('Order not found');

        if (order.status === 'PAID') {
            return { message: 'Giao dịch thành công', code: 0 };
        }

*/

        // If not yet updated, query MoMo
        const rawSignature = `accessKey=${this.config.accessKey}&orderId=${orderId}&partnerCode=${this.config.partnerCode}&requestId=${requestId}`;
        const signature = crypto
            .createHmac('sha256', this.config.secretKey)
            .update(rawSignature)
            .digest('hex');

        const requestBody = {
            partnerCode: this.config.partnerCode,
            requestId: requestId,
            orderId: orderId,
            signature: signature,
            lang: 'vi',
        };

        try {
            const endpoint = 'https://test-payment.momo.vn/v2/gateway/api/query';
            const response = await this.httpService.axiosRef.post(
                'https://test-payment.momo.vn/v2/gateway/api/query',
                requestBody,
            );

            const result = response.data;

            // Process the result returned from MoMo
            if (result.resultCode === 0) {
                // await this.orderRepository.update({ orderId }, { status: 'PAID' });
                return { message: 'Giao dịch thành công', code: 0 };
            } else {
                return {
                    message: 'Giao dịch thất bại hoặc chưa hoàn tất',
                    code: result.resultCode,
                };
            }
        } catch (error) {
            throw new InternalServerErrorException('Lỗi khi check MoMo');
        }
    }
}
