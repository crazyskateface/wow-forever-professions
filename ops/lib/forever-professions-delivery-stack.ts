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
  CDK_BOOTSTRAP_ROLE_ARNS,
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
      const role = new iam.Role(this, `${delivery.stage}GitHubRole`, {
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
        Tags.of(role).add(key, value);
      }

      role.addToPolicy(
        new iam.PolicyStatement({
          sid: "AssumeCdkBootstrapRoles",
          actions: ["sts:AssumeRole"],
          resources: CDK_BOOTSTRAP_ROLE_ARNS,
        }),
      );

      role.addToPolicy(
        new iam.PolicyStatement({
          sid: "ReadStageStackOutputs",
          actions: [
            "cloudformation:DescribeStacks",
            "cloudformation:DescribeStackResources",
          ],
          resources: [
            delivery.applicationStackName,
            delivery.dataStackName,
          ].map(
            (stackName) =>
              `arn:aws:cloudformation:${this.region}:${this.account}:stack/${stackName}/*`,
          ),
        }),
      );

      role.addToPolicy(
        new iam.PolicyStatement({
          sid: "PublishStageSite",
          actions: ["s3:GetBucketLocation", "s3:ListBucket"],
          resources: [delivery.siteBucketArnPattern],
        }),
      );
      role.addToPolicy(
        new iam.PolicyStatement({
          sid: "PublishStageSiteObjects",
          actions: ["s3:DeleteObject", "s3:PutObject"],
          resources: [`${delivery.siteBucketArnPattern}/*`],
        }),
      );

      role.addToPolicy(
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

      role.addToPolicy(
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
        Validations.of(role).acknowledge({
          id: `AwsSolutions::AwsSolutions-IAM5[Resource::${resource}]`,
          reason:
            "CloudFormation-generated resource IDs are not known until the stage is deployed. This wildcard is limited to a stable stack/logical-ID prefix or to tagged CloudFront distributions in exactly one stage.",
        });
      }

      new CfnOutput(this, `${delivery.stage}GitHubRoleArn`, {
        value: role.roleArn,
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
