import {
  buildBootcampDeploymentFlow,
  buildCohortDeploymentFlow,
  buildMilestoneDeploymentFlow,
  buildQuestDeploymentFlow,
} from "@/lib/blockchain/deployment-flows";

describe("deployment flow builders", () => {
  it("returns deterministic ordering and stable step ids", () => {
    const executeDeployment = async () => ({ transactionHash: "0x1" });
    const a = buildBootcampDeploymentFlow({
      title: "Deploy bootcamp lock",
      executeDeployment,
    });
    const b = buildBootcampDeploymentFlow({
      title: "Deploy bootcamp lock",
      executeDeployment,
    });

    expect(a.steps.map((s) => s.id)).toEqual(b.steps.map((s) => s.id));
    expect(new Set(a.steps.map((s) => s.id)).size).toBe(a.steps.length);
  });

  it("includes titles and descriptions for all entity types", () => {
    const executeDeployment = async () => ({});
    const flows = [
      buildBootcampDeploymentFlow({ title: "Bootcamp", executeDeployment }),
      buildCohortDeploymentFlow({ title: "Cohort", executeDeployment }),
      buildQuestDeploymentFlow({ title: "Quest", executeDeployment }),
      buildMilestoneDeploymentFlow({ title: "Milestone", executeDeployment }),
    ];

    for (const flow of flows) {
      expect(flow.title).toBeTruthy();
      expect(flow.description).toBeTruthy();
      expect(flow.steps.length).toBeGreaterThan(0);
      for (const step of flow.steps) {
        expect(step.id).toBeTruthy();
        expect(step.title).toBeTruthy();
        expect(step.description).toBeTruthy();
        expect(typeof step.execute).toBe("function");
      }
    }
  });

  it("uses entity-scoped step ids", () => {
    const executeDeployment = async () => ({});
    expect(
      buildBootcampDeploymentFlow({ title: "t", executeDeployment }).steps[0]
        ?.id,
    ).toBe("bootcamp:deploy_lock");
    expect(
      buildCohortDeploymentFlow({ title: "t", executeDeployment }).steps[0]?.id,
    ).toBe("cohort:deploy_lock");
    expect(
      buildQuestDeploymentFlow({ title: "t", executeDeployment }).steps[0]?.id,
    ).toBe("quest:deploy_lock");
    expect(
      buildMilestoneDeploymentFlow({ title: "t", executeDeployment }).steps[0]
        ?.id,
    ).toBe("milestone:deploy_lock");
  });
});
