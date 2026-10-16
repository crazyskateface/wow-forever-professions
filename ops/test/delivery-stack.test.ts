import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_ACCOUNT_ID,
  DEPLOYMENT_REGION,
} from "../lib/deployment-config";
import {
  DELIVERY_BUDGET_NAME,
  DELIVERY_STACK_NAME,
  DELIVERY_STAGES,
  GITHUB_OIDC_SUBJECT_PREFIX,
} from "../lib/delivery-config";
import { ForeverProfessionsDeliveryStack } from "../lib/forever-professions-delivery-stack";

function createTemplate(): {
  stack: ForeverProfessionsDeliveryStack;
  template: Template;
} {
  const app = new App();
  const stack = new ForeverProfessionsDeliveryStack(app, DELIVERY_STACK_NAME, {
    env: {
      account: DEPLOYMENT_ACCOUNT_ID,
      region: DEPLOYMENT_REGION,
    },
    terminationProtection: true,
  });
  return { stack, template: Template.fromStack(stack) };
}

describe("Forever Professions delivery stack", () => {
  it("trusts only this repository's immutable environment subjects", () => {
    const { template } = createTemplate();

    template.resourceCountIs("AWS::IAM::OIDCProvider", 1);
    for (const delivery of DELIVERY_STAGES) {
      template.hasResourceProperties("AWS::IAM::Role", {
        RoleName: delivery.roleName,
        AssumeRolePolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "sts:AssumeRoleWithWebIdentity",
              Condition: {
                StringEquals: {
                  "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
                  "token.actions.githubusercontent.com:sub":
                    `${GITHUB_OIDC_SUBJECT_PREFIX}:environment:${delivery.stage}`,
                },
              },
            }),
          ]),
        },
      });
    }
  });

  it("creates the four monitoring-only budget notifications", () => {
    const { template } = createTemplate();
    const budgets = template.findResources("AWS::Budgets::Budget");
    const budget = Object.values(budgets)[0];
    expect(budget).toBeDefined();
    if (budget === undefined) {
      throw new Error("Expected an AWS::Budgets::Budget resource.");
    }

    expect(budget.Properties.Budget).toMatchObject({
      BudgetName: DELIVERY_BUDGET_NAME,
      BudgetLimit: { Amount: 10, Unit: "USD" },
      BudgetType: "COST",
      TimeUnit: "MONTHLY",
    });
    expect(budget.Properties.NotificationsWithSubscribers).toHaveLength(4);
    expect(budget.Properties.NotificationsWithSubscribers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Notification: expect.objectContaining({
            NotificationType: "FORECASTED",
            Threshold: 100,
          }),
        }),
      ]),
    );
  });

  it("uses termination protection and never grants action star", () => {
    const { stack, template } = createTemplate();
    const policies = template.findResources("AWS::IAM::Policy");

    expect(stack.terminationProtection).toBe(true);
    expect(Object.values(policies)).toHaveLength(2);
    for (const policy of Object.values(policies)) {
      for (const statement of policy.Properties.PolicyDocument.Statement) {
        expect(statement.Action).not.toBe("*");
        expect(statement.Action).not.toContain("*");
      }
    }
  });
});
