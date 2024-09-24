import jwt from "jsonwebtoken"
import {SETTINGS} from "../../settings";

export const jwtService = {
    async createToken(payload: object, duration: string): Promise<string> {
        return jwt.sign(
            payload,
            SETTINGS.SECRET_KEY,
            {expiresIn: duration}
        )
    },

    async decodeToken(token: string) {
        try {
            return jwt.decode(token)
        } catch (error) {
            console.error('Can`t decode token')
            return null
        }
    },

    async verifyToken(token: string) {
        try {
            return jwt.verify(token, SETTINGS.SECRET_KEY)
        } catch (error) {
            console.error('Token verify some error')
            return null
        }
    }
}