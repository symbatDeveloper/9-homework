import {Collection, Db, MongoClient} from "mongodb"
import {SETTINGS} from "../settings"
import {BlogDBType} from "./blog-db-type";
import {PostDbType} from "./post-db-type";
import {UserDbType} from "./user-db-type";
import {CommentDbType} from "./comment-db-type";
import {RefreshTokenDbType} from "./refresh-token-db-type";
import {ApiCallDbType} from "./api-call-db-type";
import {DeviceSessionsDbType} from "./device-sessions-db-type";

let client = {} as MongoClient
export let db = {} as Db

export let blogCollection: Collection<BlogDBType> = {} as Collection<BlogDBType>
export let postCollection: Collection<PostDbType> = {} as Collection<PostDbType>
export let userCollection: Collection<UserDbType> = {} as Collection<UserDbType>
export let commentCollection: Collection<CommentDbType> = {} as Collection<CommentDbType>
export let refreshTokenCollection: Collection<RefreshTokenDbType> = {} as Collection<RefreshTokenDbType>
export let apiCallsCollection: Collection<ApiCallDbType> = {} as Collection<ApiCallDbType>
export let deviceSessionsCollection: Collection<DeviceSessionsDbType> = {} as Collection<DeviceSessionsDbType>

export const connectToDb = async (DB_URL: string) => {
    try {
        client = new MongoClient(DB_URL)
        db = client.db(SETTINGS.DB_NAME)
        blogCollection = db.collection<BlogDBType>(SETTINGS.BLOG_COLLECTION_NAME)
        postCollection = db.collection<PostDbType>(SETTINGS.POST_COLLECTION_NAME)
        userCollection = db.collection<UserDbType>(SETTINGS.USER_COLLECTION_NAME)
        commentCollection = db.collection<CommentDbType>(SETTINGS.COMMENT_COLLECTION_NAME)
        refreshTokenCollection = db.collection<RefreshTokenDbType>(SETTINGS.REFRESH_TOKEN_COLLECTION_NAME)
        apiCallsCollection = db.collection<ApiCallDbType>(SETTINGS.API_CALLS_COLLECTION_NAME)
        deviceSessionsCollection = db.collection<DeviceSessionsDbType>(SETTINGS.DEVICE_SESSIONS_COLLECTION_NAME)
        await client.connect()
        console.log('Connected to db')
        return true
    } catch (e) {
        console.log(e)
        await client.close()
        return false
    }
}