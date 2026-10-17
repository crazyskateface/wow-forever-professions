import {
  CfnOutput,
  CfnParameter,
  Duration,
  Stack,
  Tags,
  Validations,
  type StackProps,
} from "aws-cdk-lib";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as iam from "aws-cdk-lib/aws-iam";
import type { Construct } from "constructs";
import {
  DELIVERY_BUDGET_LIMIT_USD,
  DELIVERY_BUDGET_NAME,
  DELIVERY_STAGES,
  GITHUB_OIDC_CONDITION_PREFIX,
  GITHUB_OIDC_PROVIDER_URL,
  GITHUB_OIDC_SUBJECT_PREFIX,
  GITHUB_REPOSITORY,
} from "./delivery-config";

export class ForeverProfessionsDeliveryStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const budgetNotificationEmail = new CfnParameter(
      this,
      "BudgetNotificationEmail",
      {
        type: "String",
        allowedPattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
        constraintDescription: "must be a valid email address",
        description:
          "Primary operator email for Forever Professions budget notifications.",
      },
    );

    const provider = new iam.CfnOIDCProvider(this, "GitHubProvider", {
      url: GITHUB_OIDC_PROVIDER_URL,
      clientIdList: ["sts.amazonaws.com"],
    });

    for (const delivery of DELIVERY_STAGES) {
      const githubRole = new iam.Role(this, `${delivery.stage}GitHubRole`, {
        roleName: delivery.roleName,
        description: `GitHub Actions delivery role for Forever Professions ${delivery.stage}.`,
        maxSessionDuration: Duration.hours(1),
        assumedBy: new iam.WebIdentityPrincipal(
          provider.attrArn,
          {
            StringEquals: {
              [`${GITHUB_OIDC_CONDITION_PREFIX}:aud`]: "sts.amazonaws.com",
              [`${GITHUB_OIDC_CONDITION_PREFIX}:sub`]:
                `${GITHUB_OIDC_SUBJECT_PREFIX}:environment:${delivery.stage}`,
            },
          },
        ),
      });

      for (const [key, value] of Object.entries({
        Application: "forever-professions",
        Environment: delivery.stage,
        ManagedBy: "aws-cdk",
        Repository: GITHUB_REPOSITORY,
        Owner: "crazyskateface",
        CostCenter: "personal-project",
      })) {
        Tags.of(githubRole).add(key, value);
      }

      const deploymentRole = new iam.Role(
        this,
        `${delivery.stage}DeploymentRole`,
        {
          roleName: delivery.deploymentRoleName,
          description: `Stack-scoped CDK deployment role for Forever Professions ${delivery.stage}.`,
          maxSessionDuration: Duration.hours(1),
          assumedBy: new iam.ArnPrincipal(githubRole.roleArn),
        },
      );
      for (const [key, value] of Object.entries({
        Application: "forever-professions",
        Environment: delivery.stage,
        ManagedBy: "aws-cdk",
        Repository: GITHUB_REPOSITORY,
        Owner: "crazyskateface",
        CostCenter: "personal-project",
      })) {
        Tags.of(deploymentRole).add(key, value);
      }

      const stageStackArns = [
        delivery.applicationStackName,
        delivery.dataStackName,
      ].map(
        (stackName) =>
          `arn:aws:cloudformation:${this.region}:${this.account}:stack/${stackName}/*`,
      );
      deploymentRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "CreateOrUpdateStageStacks",
          actions: [
            "cloudformation:CreateChangeSet",
            "cloudformation:CreateStack",
            "cloudformation:UpdateStack",
          ],
          resources: stageStackArns,
          conditions: {
            StringEquals: {
              "cloudformation:RoleArn":
                delivery.cloudFormationExecutionRoleArn,
            },
          },
        }),
      );
      deploymentRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "OperateStageStacks",
          actions: [
            "cloudformation:ContinueUpdateRollback",
            "cloudformation:DeleteChangeSet",
            "cloudformation:DeleteStack",
            "cloudformation:DescribeChangeSet",
            "cloudformation:DescribeStackEvents",
            "cloudformation:DescribeStackResources",
            "cloudformation:DescribeStacks",
            "cloudformation:ExecuteChangeSet",
            "cloudformation:GetTemplate",
            "cloudformation:ListStackResources",
            "cloudformation:RollbackStack",
            "cloudformation:UpdateTerminationProtection",
          ],
          resources: stageStackArns,
        }),
      );
      deploymentRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "PassStageCloudFormationExecutionRole",
          actions: ["iam:PassRole"],
          resources: [delivery.cloudFormationExecutionRoleArn],
          conditions: {
            StringEquals: {
              "iam:PassedToService": "cloudformation.amazonaws.com",
            },
          },
        }),
      );
      deploymentRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "ReadStageBootstrapMetadata",
          actions: ["ssm:GetParameter", "ssm:GetParameters"],
          resources: [
            `arn:aws:ssm:${this.region}:${this.account}:parameter/cdk-bootstrap/${delivery.bootstrapQualifier}/version`,
          ],
        }),
      );
      deploymentRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "ReadStageBootstrapAssets",
          actions: [
            "s3:GetBucketLocation",
            "s3:GetEncryptionConfiguration",
            "s3:GetObject",
            "s3:ListBucket",
          ],
          resources: [
            `arn:aws:s3:::cdk-${delivery.bootstrapQualifier}-assets-${this.account}-${this.region}`,
            `arn:aws:s3:::cdk-${delivery.bootstrapQualifier}-assets-${this.account}-${this.region}/*`,
          ],
        }),
      );
      deploymentRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "IdentifyDeploymentSession",
          actions: ["sts:GetCallerIdentity"],
          resources: ["*"],
        }),
      );

      githubRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "AssumeStageDeliveryRoles",
          actions: ["sts:AssumeRole"],
          resources: [
            delivery.deploymentRoleArn,
            ...delivery.cdkBootstrapRoleArns,
          ],
        }),
      );

      githubRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "ReadStageStackOutputs",
          actions: [
            "cloudformation:DescribeStacks",
            "cloudformation:DescribeStackResources",
          ],
          resources: stageStackArns,
        }),
      );

      githubRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "PublishStageSite",
          actions: ["s3:GetBucketLocation", "s3:ListBucket"],
          resources: [delivery.siteBucketArnPattern],
        }),
      );
      githubRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "PublishStageSiteObjects",
          actions: ["s3:DeleteObject", "s3:PutObject"],
          resources: [`${delivery.siteBucketArnPattern}/*`],
        }),
      );

      githubRole.addToPolicy(
        new iam.PolicyStatement({
          sid: "InvalidateStageDistribution",
          actions: [
            "cloudfront:CreateInvalidation",
            "cloudfront:GetDistribution",
            "cloudfront:GetInvalidation",
          ],
          resources: [
            `arn:aws:cloudfront::${this.account}:distribution/*`,
          ],
          conditions: {
            StringEquals: {
              "aws:ResourceTag/Application": "forever-professions",
              "aws:ResourceTag/Environment": delivery.stage,
            },
          },
        }),
      );

      githubRole.addToPolicy(
        new iam.PolicyStatement({
          sid:
            delivery.migrationRoleArnPattern === undefined
              ? "AssumeStageIngestionRole"
              : "AssumeStageDataRoles",
          actions: ["sts:AssumeRole"],
          resources: [
            delivery.ingestionRoleArnPattern,
            ...(delivery.migrationRoleArnPattern === undefined
              ? []
              : [delivery.migrationRoleArnPattern]),
          ],
        }),
      );

      const wildcardResources = [
        ...[delivery.applicationStackName, delivery.dataStackName].map(
          (stackName) =>
            `arn:aws:cloudformation:${this.region}:${this.account}:stack/${stackName}/*`,
        ),
        delivery.siteBucketArnPattern,
        `${delivery.siteBucketArnPattern}/*`,
        `arn:aws:cloudfront::${this.account}:distribution/*`,
        delivery.ingestionRoleArnPattern,
        ...(delivery.migrationRoleArnPattern === undefined
          ? []
          : [delivery.migrationRoleArnPattern]),
      ];
      for (const resource of wildcardResources) {
        Validations.of(githubRole).acknowledge({
          id: `AwsSolutions::AwsSolutions-IAM5[Resource::${resource}]`,
          reason:
            "CloudFormation-generated resource IDs are not known until the stage is deployed. This wildcard is limited to a stable stack/logical-ID prefix or to tagged CloudFront distributions in exactly one stage.",
        });
      }
      for (const resource of [
        ...stageStackArns,
        `arn:aws:s3:::cdk-${delivery.bootstrapQualifier}-assets-${this.account}-${this.region}/*`,
      ]) {
        Validations.of(deploymentRole).acknowledge({
          id: `AwsSolutions::AwsSolutions-IAM5[Resource::${resource}]`,
          reason:
            "The wildcard is limited to CloudFormation-generated identifiers inside exactly one environment's named stacks or CDK asset bucket.",
        });
      }
      Validations.of(deploymentRole).acknowledge({
        id: "AwsSolutions::AwsSolutions-IAM5[Resource::*]",
        reason:
          "STS GetCallerIdentity does not support resource-level permissions and grants no mutation capability.",
      });

      new CfnOutput(this, `${delivery.stage}GitHubRoleArn`, {
        value: githubRole.roleArn,
      });
      new CfnOutput(this, `${delivery.stage}DeploymentRoleArn`, {
        value: deploymentRole.roleArn,
      });
    }

    const emailSubscriber = {
      address: budgetNotificationEmail.valueAsString,
      subscriptionType: "EMAIL",
    };
    const actualThreshold = (threshold: number) => ({
      notification: {
        comparisonOperator: "GREATER_THAN",
        notificationType: "ACTUAL",
        threshold,
        thresholdType: "PERCENTAGE",
      },
      subscribers: [emailSubscriber],
    });

    new budgets.CfnBudget(this, "MonthlyBudget", {
      budget: {
        budgetLimit: {
          amount: DELIVERY_BUDGET_LIMIT_USD,
          unit: "USD",
        },
        budgetName: DELIVERY_BUDGET_NAME,
        budgetType: "COST",
        timeUnit: "MONTHLY",
      },
      notificationsWithSubscribers: [
        actualThreshold(50),
        actualThreshold(80),
        actualThreshold(100),
        {
          notification: {
            comparisonOperator: "GREATER_THAN",
            notificationType: "FORECASTED",
            threshold: 100,
            thresholdType: "PERCENTAGE",
          },
          subscribers: [emailSubscriber],
        },
      ],
    });

    new CfnOutput(this, "GitHubProviderArn", {
      value: provider.attrArn,
    });
    new CfnOutput(this, "BudgetName", { value: DELIVERY_BUDGET_NAME });
  }
}
