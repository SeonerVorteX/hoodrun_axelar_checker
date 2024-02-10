import { createAppSchema } from "@database/helper";
import { model, Schema } from "mongoose";
import { IPollDocument, PollState } from "./poll.interface";

const POLL_COLLECTION_NAME = "polls";

const PollSchema: Schema<IPollDocument> = createAppSchema<IPollDocument>({
  pollId: {
    type: String,
    required: true,
    unique: true,
  },
  pollChain: {
    type: String,
    required: true,
  },
  pollState: {
    type: String,
    enum: Object.values(PollState),
    required: true,
  },
  participants: {
    type: [String],
    required: true,
  },
  txHash: {
    type: String,
    required: true,
  },
  txHeight: {
    type: Number,
    required: true,
  },
});

PollSchema.statics.buildModel = (args: IPollDocument) => {
  return new PollDbModel(args);
};

const PollDbModel = model<IPollDocument>(POLL_COLLECTION_NAME, PollSchema);

export default PollDbModel;
