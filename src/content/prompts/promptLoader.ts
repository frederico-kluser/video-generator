import {
  DEFAULT_PROMPT_BLUEPRINT_ID,
  getPromptBlueprintById,
  type PromptBlueprintId,
} from './promptCatalog';

const promptModules = import.meta.glob<() => Promise<string>>(
  '../../../docs/prompts/*.md',
  {
    as: 'raw',
  },
);

const normalizedPromptModules = Object.fromEntries(
  Object.entries(promptModules).map(([path, loader]) => {
    const normalized = path.replace(/.*docs\/prompts\//, '');
    return [normalized, loader];
  }),
) as Record<string, () => Promise<string>>;

export async function loadPromptMarkdown(docFile: string): Promise<string> {
  const loader = normalizedPromptModules[docFile];

  if (!loader) {
    throw new Error(`Prompt markdown "${docFile}" não encontrado.`);
  }

  return loader();
}

export async function loadBlueprintMarkdown(
  promptId?: PromptBlueprintId,
): Promise<string> {
  const blueprint = getPromptBlueprintById(
    promptId ?? DEFAULT_PROMPT_BLUEPRINT_ID,
  );

  return loadPromptMarkdown(blueprint.docFile);
}
