import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
export async function handler() {
  const client = new SFNClient({ region: process.env.AWS_REGION });
  const input = {
    stateMachineArn: process.env.SFN_ARN,
  };
  const command = new StartExecutionCommand(input);
  const response = await client.send(command);
  return response;
}
