import { LangGraphRunnableConfig } from "@langchain/langgraph";
import { OpenCanvasGraphAnnotation } from "../../state";
import {
  formatArtifactContent,
  getModelConfig,
  getModelFromConfig,
  isUsingO1MiniModel,
} from "@/agent/utils";
import { getArtifactContent } from "@/contexts/utils";
import { GET_TITLE_TYPE_REWRITE_ARTIFACT } from "../../prompts";
import { OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA } from "./schemas";
import { ToolCall } from "@langchain/core/messages/tool";
import { getFormattedReflections } from "../../../utils";

export async function optionallyUpdateArtifactMeta(
  state: typeof OpenCanvasGraphAnnotation.State,
  config: LangGraphRunnableConfig
): Promise<ToolCall | undefined> {
  const { modelProvider } = getModelConfig(config, {
    isToolCalling: true,
  });
  const toolCallingModel = (
    await getModelFromConfig(config, {
      isToolCalling: true,
    })
  )
    .bindTools(
      [
        {
          name: "optionallyUpdateArtifactMeta",
          schema: OPTIONALLY_UPDATE_ARTIFACT_META_SCHEMA,
          description: "Update the artifact meta information, if necessary.",
        },
      ],
      {
        // Ollama does not support tool choice
        ...(modelProvider !== "ollama" && {
          tool_choice: "optionallyUpdateArtifactMeta",
        }),
      }
    )
    .withConfig({ runName: "optionally_update_artifact_meta" });

  const memoriesAsString = await getFormattedReflections(config);

  const currentArtifactContent = state.artifact
    ? getArtifactContent(state.artifact)
    : undefined;
  if (!currentArtifactContent) {
    throw new Error("No artifact found");
  }

  const optionallyUpdateArtifactMetaPrompt =
    GET_TITLE_TYPE_REWRITE_ARTIFACT.replace(
      "{artifact}",
      formatArtifactContent(currentArtifactContent, true)
    ).replace("{reflections}", memoriesAsString);

  const recentHumanMessage = state._messages.findLast(
    (message) => message.getType() === "human"
  );
  if (!recentHumanMessage) {
    throw new Error("No recent human message found");
  }

  const isO1MiniModel = isUsingO1MiniModel(config);
  const optionallyUpdateArtifactResponse = await toolCallingModel.invoke([
    {
      role: isO1MiniModel ? "user" : "system",
      content: optionallyUpdateArtifactMetaPrompt,
    },
    recentHumanMessage,
  ]);

  return optionallyUpdateArtifactResponse.tool_calls?.[0];
}
