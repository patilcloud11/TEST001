/**
 * DynamoDB Stream Logger
 * Publishes DynamoDB change events to CloudWatch Logs for audit trail.
 */
const { CloudWatchLogsClient, CreateLogStreamCommand, PutLogEventsCommand, DescribeLogStreamsCommand } = require("@aws-sdk/client-cloudwatch-logs");

const client = new CloudWatchLogsClient({ region: process.env.AWS_REGION });
const LOG_GROUP = process.env.LOG_GROUP_NAME;

async function getOrCreateLogStream(streamName) {
  try {
    const res = await client.send(new DescribeLogStreamsCommand({
      logGroupName: LOG_GROUP,
      logStreamNamePrefix: streamName,
      limit: 1
    }));
    if (res.logStreams && res.logStreams.length > 0 && res.logStreams[0].logStreamName === streamName) {
      return res.logStreams[0].uploadSequenceToken;
    }
  } catch (_) {}
  await client.send(new CreateLogStreamCommand({ logGroupName: LOG_GROUP, logStreamName: streamName }));
  return undefined;
}

exports.handler = async (event) => {
  const today = new Date().toISOString().split("T")[0];
  const streamName = `dynamodb-changes-${today}`;
  const sequenceToken = await getOrCreateLogStream(streamName);

  const logEvents = event.Records.map(record => ({
    timestamp: Date.now(),
    message: JSON.stringify({
      eventID:    record.eventID,
      eventName:  record.eventName,
      tableName:  record.eventSourceARN.split("/")[1],
      keys:       record.dynamodb.Keys,
      newImage:   record.dynamodb.NewImage   || null,
      oldImage:   record.dynamodb.OldImage   || null,
      timestamp:  new Date().toISOString()
    })
  }));

  const params = {
    logGroupName:  LOG_GROUP,
    logStreamName: streamName,
    logEvents,
    ...(sequenceToken ? { sequenceToken } : {})
  };

  await client.send(new PutLogEventsCommand(params));
  console.log(`Logged ${logEvents.length} DynamoDB change events`);
};
