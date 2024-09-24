import {usersMongoRepository} from "../repositories/users-mongo-repository";
import {
    ApiCallDataInputType,
    LoginInputType,
    LoginServiceOutputType,
    RegistrationConfirmationCodeInputType,
    RegistrationEmailResendingInputType
} from "../types/auth-types";
import {bcryptService} from "../common/adapters/bcrypt-service";
import {UserDbType} from "../db/user-db-type";
import {Result} from "../common/types/result-type";
import {ResultStatus} from "../common/types/result-code";
import {jwtService} from "../common/adapters/jwt-service";
import {InputUserType} from "../types/user-types";
import {ObjectId} from "mongodb";
import {dateTimeIsoString} from "../common/helpers/date-time-iso-string";
import {randomUUID} from "node:crypto";
import {add} from "date-fns/add";
import {nodemailerAdapter} from "../common/adapters/nodemailer-adapter";
import {SETTINGS} from "../settings";
import {authMongoRepository} from "../repositories/auth-mongo-repository";
import {DeviceSessionsDbType} from "../db/device-sessions-db-type";
import {securityDevicesMongoRepository} from "../repositories/security-devices-mongo-repository";
import {CustomJwtPayload} from "../common/types/custom-jwt-payload-type";

export const authService = {
    async registerUser(inputUser: InputUserType): Promise<Result> {
        if (!inputUser.login || !inputUser.password || !inputUser.email) {
            return {
                status: ResultStatus.BadRequest,
                extensions: [{field: 'login,password,email', message: 'All fields are required'}],
                data: null
            }
        }
        const existingUserByLogin = await usersMongoRepository.findByLoginOrEmail({
            loginOrEmail: inputUser.login,
            password: inputUser.password
        })
        if (existingUserByLogin) {
            return {
                status: ResultStatus.BadRequest,
                extensions: [{field: 'login', message: 'Login is not unique'}],
                data: null
            }
        }
        const existingUserByEmail = await usersMongoRepository.findByLoginOrEmail({
            loginOrEmail: inputUser.email,
            password: inputUser.password
        })
        if (existingUserByEmail) {
            return {
                status: ResultStatus.BadRequest,
                extensions: [{field: 'email', message: 'Email is not unique'}],
                data: null
            }
        }
        const passHash = await bcryptService.generateHash(inputUser.password)
        const createNewUser: UserDbType = {
            ...inputUser,
            password: passHash,
            _id: new ObjectId(),
            createdAt: dateTimeIsoString(),
            emailConfirmation: {
                confirmationCode: randomUUID(),
                expirationDate: add(new Date(), {
                    hours: 1
                }),
                isConfirmed: false
            }
        }
        await usersMongoRepository.create(createNewUser)
        nodemailerAdapter.sendEmail(
            createNewUser.email,
            createNewUser.emailConfirmation.confirmationCode
        ).catch((error) => {
            console.error('Send email error', error)
        })
        return {
            status: ResultStatus.Success,
            data: null
        }
    },

    async confirmationRegistrationUser(inputCode: RegistrationConfirmationCodeInputType): Promise<Result<boolean | null>> {
        const verifiedUser = await usersMongoRepository.findByConfirmationCode(inputCode)
        if (!verifiedUser) {
            return {
                status: ResultStatus.BadRequest,
                extensions: [{field: 'code', message: 'Confirmation code is incorrect'}],
                data: null
            }
        }
        if (verifiedUser.emailConfirmation.isConfirmed) {
            return {
                status: ResultStatus.BadRequest,
                extensions: [{field: 'code', message: 'The account has already been confirmed'}],
                data: null
            }
        }
        if (verifiedUser.emailConfirmation.expirationDate < new Date()) {
            return {
                status: ResultStatus.BadRequest,
                extensions: [{field: 'code', message: 'The confirmation code has expired'}],
                data: null
            }
        }
        const isConfirmed = true
        await usersMongoRepository.updateEmailConfirmation(verifiedUser._id, isConfirmed)
        return {
            status: ResultStatus.Success,
            data: null
        }
    },

    async registrationEmailResending(inputEmail: RegistrationEmailResendingInputType): Promise<Result> {
        const existingUserByEmail = await usersMongoRepository.findByEmail(inputEmail)
        if (!existingUserByEmail) {
            return {
                status: ResultStatus.BadRequest,
                extensions: [{field: 'email', message: 'User with this email does not exist'}],
                data: null
            }
        }
        if (existingUserByEmail.emailConfirmation.isConfirmed) {
            return {
                status: ResultStatus.BadRequest,
                extensions: [{field: 'email', message: 'The account has already been confirmed'}],
                data: null
            }
        }
        const newConfirmationCode = randomUUID()
        const newExpirationDate = add(new Date(), {
            hours: 1
        })
        await usersMongoRepository.updateRegistrationConfirmation(existingUserByEmail._id, newConfirmationCode, newExpirationDate)
        nodemailerAdapter.sendEmail(
            inputEmail.email,
            newConfirmationCode
        )
            .catch(()=>{console.log('Send email error')})
        return {
            status: ResultStatus.Success,
            data: null
        }
    },

    async loginUser(inputAuth: LoginInputType, ip: string, deviceName: string): Promise<Result<LoginServiceOutputType | null>> {
        const userAuth = await this.authenticateUser(inputAuth)
        if (userAuth.status === ResultStatus.Unauthorized) {
            return {
                status: ResultStatus.Unauthorized,
                extensions: userAuth.extensions,
                data: null
            }
        }
        const payload: Pick<DeviceSessionsDbType, 'userId' | 'deviceId'> = {
            userId: userAuth.data,
            deviceId: randomUUID()
        }
        const accessToken = await jwtService.createToken(userAuth, SETTINGS.ACCESS_TOKEN_DURATION)
        const refreshToken = await jwtService.createToken(payload, SETTINGS.REFRESH_TOKEN_DURATION)
        const decodePayload = await jwtService.decodeToken(refreshToken) as CustomJwtPayload
        const deviceSession: DeviceSessionsDbType = {
            userId: decodePayload.userId,
            deviceId: decodePayload.deviceId,
            ip: ip,
            deviceName: deviceName,
            iatDate: new Date(decodePayload.iat! * 1000).toISOString(),
            expDate: new Date(decodePayload.exp! * 1000).toISOString()
        }
        await securityDevicesMongoRepository.create(deviceSession)
        return {
            status: ResultStatus.Success,
            data: {accessToken, refreshToken}
        }
    },

    async refreshToken(payload: CustomJwtPayload): Promise<Result<LoginServiceOutputType | null>> {
        const newPayload: Pick<DeviceSessionsDbType, 'userId' | 'deviceId'> = {
            userId: payload.userId,
            deviceId: payload.deviceId
        }
        const accessToken = await jwtService.createToken(newPayload, SETTINGS.ACCESS_TOKEN_DURATION)
        const refreshToken = await jwtService.createToken(newPayload, SETTINGS.REFRESH_TOKEN_DURATION)
        const decodeNewPayload = await jwtService.decodeToken(refreshToken) as CustomJwtPayload
        const deviceId = decodeNewPayload.deviceId
        const iatDate = new Date(decodeNewPayload.iat! * 1000).toISOString()
        await securityDevicesMongoRepository.updateByDeviceId(deviceId, iatDate)
        return {
            status: ResultStatus.Success,
            data: {accessToken, refreshToken}
        }
    },

    async logout(deviceId: string): Promise<Result<boolean | null>> {
        const findDevice = await securityDevicesMongoRepository.findByDeviceId(deviceId)
        if (!findDevice) {
            return {
                status: ResultStatus.NotFound,
                extensions: [{field: 'deviceId', message: 'The device was not found'}],
                data: null
            }
        }
        const result = await securityDevicesMongoRepository.deleteByDeviceId(findDevice.deviceId)
        return {
            status: ResultStatus.Success,
            data: result
        }
    },

    async checkApiCalls(apiCallData: ApiCallDataInputType): Promise<Result> {
        const timeLimit = add(new Date(), {seconds:-SETTINGS.TIME_LIMIT_API_CALLS})
        const numberLimit = parseInt(SETTINGS.NUMBER_LIMIT_API_CALLS, 10)
        const countApiCalls = await authMongoRepository.findApiCalls(apiCallData, timeLimit)
        if (countApiCalls >= numberLimit) {
            return {
                status: ResultStatus.TooManyRequests,
                extensions: [{field: 'rateLimit', message: 'Too many requests in a short period'}],
                data: null
            }
        }
        const apiCall = {
            ip: apiCallData.ip,
            url: apiCallData.url,
            date: new Date()
        }
        await authMongoRepository.addApiCall(apiCall)
        return {
            status: ResultStatus.Success,
            data: null
        }
    },

    async authenticateUser(inputAuth: LoginInputType): Promise<Result<string | null>> {
        const userAuth: UserDbType | null = await usersMongoRepository.findByLoginOrEmail(inputAuth)
        if (!userAuth) {
            return {
                status: ResultStatus.Unauthorized,
                extensions: [{field: 'login or email', message: 'Login or email is not unique'}],
                data: null
            }
        }
        const result = await bcryptService.checkPassword(inputAuth.password, userAuth.password)
        if (!result) {
            return {
                status: ResultStatus.Unauthorized,
                extensions: [{field: 'password', message: 'Password is wrong'}],
                data: null
            }
        }
        return {
            status: ResultStatus.Success,
            data: userAuth._id.toString()
        }
    }
}