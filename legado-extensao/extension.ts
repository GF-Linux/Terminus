import * as vscode from "vscode";
import { Catalog, CatalogEntry, CatalogLoadError, CatalogTask, loadCatalog } from "./catalog";

/** Nó da árvore: ou uma tarefa (pasta), ou uma entrada (função/classe). */
type Node = { kind: "task"; task: CatalogTask } | { kind: "entry"; entry: CatalogEntry };

class CatalogProvider implements vscode.TreeDataProvider<Node> {
  private readonly changed = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changed.event;

  private catalog: Catalog | undefined;
  private loadError: string | undefined;

  constructor(private readonly extensionPath: string) {
    this.reload();
  }

  reload(): void {
    try {
      this.catalog = loadCatalog(this.extensionPath);
      this.loadError = undefined;
    } catch (err) {
      this.catalog = undefined;
      this.loadError = err instanceof CatalogLoadError ? err.message : String(err);
      vscode.window.showErrorMessage(`Bancada: ${this.loadError}`);
    }
    this.changed.fire(undefined);
  }

  get versionLabel(): string {
    return this.catalog ? `Biopython ${this.catalog.biopython_version}` : "catálogo não carregado";
  }

  getChildren(node?: Node): Node[] {
    if (!this.catalog) {
      return [];
    }
    if (!node) {
      return this.catalog.tasks.map((task) => ({ kind: "task" as const, task }));
    }
    if (node.kind === "task") {
      return node.task.entries.map((entry) => ({ kind: "entry" as const, entry }));
    }
    return [];
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "task") {
      const item = new vscode.TreeItem(
        node.task.title,
        vscode.TreeItemCollapsibleState.Collapsed
      );
      item.description = `${node.task.entries.length}`;
      item.tooltip = node.task.why;
      item.iconPath = new vscode.ThemeIcon("folder");
      return item;
    }

    const { entry } = node;
    // Rótulo é só o nome final; o caminho completo vai na descrição, para a
    // árvore continuar legível numa barra lateral estreita.
    const shortName = entry.path.split(".").pop() ?? entry.path;
    const item = new vscode.TreeItem(shortName, vscode.TreeItemCollapsibleState.None);
    item.description = entry.path;
    item.contextValue = "bancada.entrada";
    item.iconPath = new vscode.ThemeIcon(
      entry.deprecated ? "warning" : entry.kind === "class" ? "symbol-class" : "symbol-method"
    );

    const parts: string[] = [];
    parts.push(`**${entry.path}**${entry.signature ?? ""}`);
    if (entry.doc) {
      parts.push(entry.doc);
    }
    if (entry.note) {
      parts.push(`_${entry.note}_`);
    }
    if (entry.deprecated) {
      parts.push(`⚠️ **Depreciado:** ${entry.deprecated}`);
    }
    parts.push("```python\n" + entry.snippet + "\n```");
    item.tooltip = new vscode.MarkdownString(parts.join("\n\n"));

    item.command = {
      command: "bancada.inserirTrecho",
      title: "Inserir trecho",
      arguments: [entry],
    };
    return item;
  }
}

async function inserirTrecho(entry: CatalogEntry): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    await vscode.env.clipboard.writeText(entry.snippet);
    vscode.window.showInformationMessage(
      "Bancada: nenhum editor aberto — trecho copiado para a área de transferência."
    );
    return;
  }
  if (entry.deprecated) {
    const escolha = await vscode.window.showWarningMessage(
      `${entry.path} está depreciado no Biopython. Inserir mesmo assim?`,
      { modal: true },
      "Inserir"
    );
    if (escolha !== "Inserir") {
      return;
    }
  }
  await editor.insertSnippet(new vscode.SnippetString(entry.snippet));
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new CatalogProvider(context.extensionPath);

  const view = vscode.window.createTreeView("bancada.catalogo", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  view.description = provider.versionLabel;

  context.subscriptions.push(
    view,
    vscode.commands.registerCommand("bancada.inserirTrecho", inserirTrecho),
    vscode.commands.registerCommand("bancada.copiarTrecho", async (entry: CatalogEntry) => {
      await vscode.env.clipboard.writeText(entry.snippet);
      vscode.window.showInformationMessage(`Bancada: trecho de ${entry.path} copiado.`);
    }),
    vscode.commands.registerCommand("bancada.recarregarCatalogo", () => {
      provider.reload();
      view.description = provider.versionLabel;
    })
  );
}

export function deactivate(): void {
  // nada a desfazer — a árvore e os comandos saem via context.subscriptions
}
