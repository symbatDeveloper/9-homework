import {
    apiCallsCollection,
    blogCollection,
    commentCollection, deviceSessionsCollection,
    postCollection,
    refreshTokenCollection,
    userCollection
} from "../db/mongo-db";

export const testingMongoRepository = {
    async deleteAllData() {
        await blogCollection.deleteMany()
        await postCollection.deleteMany()
        await userCollection.deleteMany()
        await commentCollection.deleteMany()
        await refreshTokenCollection.deleteMany()
        await apiCallsCollection.deleteMany()
        await deviceSessionsCollection.deleteMany()
    }
}