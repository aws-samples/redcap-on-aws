import { CfnResource, RemovalPolicy } from 'aws-cdk-lib';

export class OverrideEc2ServerRemovalPolicy {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  visit(node: any) {
    if (node instanceof CfnResource) {
      if (node.stack.stackName.includes('EC2Server')) {
        node.applyRemovalPolicy(RemovalPolicy.DESTROY);
      }
    }
  }
}
