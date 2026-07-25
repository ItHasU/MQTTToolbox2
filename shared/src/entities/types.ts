import { APP_MODEL } from "./model";

//#region Properties types ----------------------------------------------------

export type AppFieldTypes = typeof APP_MODEL.fieldTypes;

export type UserId = typeof APP_MODEL.fieldTypes["USER_ID"];
export type TopicId = typeof APP_MODEL.fieldTypes["TOPIC_ID"];
export type MessageId = typeof APP_MODEL.fieldTypes["MESSAGE_ID"];
export type TopicName = typeof APP_MODEL.fieldTypes["TOPIC_NAME"];
export type Timestamp = typeof APP_MODEL.fieldTypes["TIMESTAMP"];

//#endregion

//#region Entities types ------------------------------------------------------

export type AppEntityTypes = typeof APP_MODEL.tablesFields;

export type TopicEntity = AppEntityTypes["topics"];
export type MessageEntity = AppEntityTypes["messages"];

//#endregion
