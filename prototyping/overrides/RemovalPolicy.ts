import { CfnResource, RemovalPolicy } from 'aws-cdk-lib';

export class OverrideEc2ServerRemovalPolicy {
  // biome-ignore lint/suspicious/noExplicitAny: CfnResource
  visit(node: any) {
    if (node instanceof CfnResource) {
      if (node.stack.stackName.includes('EC2Server')) {
        node.applyRemovalPolicy(RemovalPolicy.DESTROY);
      }
    }
  }
}
