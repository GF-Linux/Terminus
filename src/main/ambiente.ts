import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import type { Versoes } from "../shared/tipos.js";

const executar = promisify(execFile);

/**
 * Onde procurar o interpretador. A Bancada não cria ambiente: ela usa o que o
 * laboratório já tem. A ordem é deliberada — o env do EasyContig primeiro,
 * porque é onde o Biopython e o BLAST+ realmente estão nesta máquina.
 *
 * TODO(ADR futura): isto está fixo no código. Vira configuração assim que a
 * tela de Configurações existir; hoje seria configuração sem lugar onde morar.
 */
const CANDIDATOS_PYTHON = [
  path.join(os.homedir(), "miniforge3", "envs", "easycontig-demo", "bin", "python"),
  "/usr/bin/python3",
];

const TRACY = path.join(os.homedir(), "projetos", "dna-contingency", "bin", "tracy.exe");

/** Devolve o primeiro interpretador que existe no disco. */
export function acharPython(): string {
  for (const c of CANDIDATOS_PYTHON) {
    if (path.isAbsolute(c) && fs.existsSync(c)) return c;
  }
  // Última tentativa: deixa o sistema resolver pelo PATH. Se não houver, quem
  // for executar recebe ENOENT e a interface mostra o erro real.
  return "python3";
}

async function saidaDe(cmd: string, args: string[]): Promise<string> {
  try {
    const { stdout, stderr } = await executar(cmd, args, { timeout: 30_000 });
    return (stdout ?? "") + (stderr ?? "");
  } catch {
    return "";
  }
}

/**
 * Lê as versões reais das ferramentas instaladas. Mesma lógica que
 * tools/build_prototype.py usa para a barra de estado do protótipo — a barra de
 * estado do aplicativo mostra o ambiente de verdade, nunca um valor escrito à mão.
 */
export async function detectarVersoes(): Promise<Versoes> {
  const versoes: Versoes = { python: "?", biopython: "?", blast: "?", tracy: "?" };
  const python = acharPython();

  const bio = (
    await saidaDe(python, [
      "-c",
      "import Bio,sys;print(Bio.__version__);print('.'.join(map(str,sys.version_info[:3])))",
    ])
  ).split(/\s+/).filter(Boolean);
  if (bio.length >= 2) {
    versoes.biopython = bio[0]!;
    versoes.python = bio[1]!;
  }

  if (fs.existsSync(TRACY)) {
    const m = /Tracy version:\s*v?([\d.]+)/.exec(await saidaDe(TRACY, ["--version"]));
    if (m) versoes.tracy = m[1]!;
  }

  // O blastn mora ao lado do python do env; se não estiver lá, tenta o PATH.
  const blastnLocal = path.join(path.dirname(python), "blastn");
  const blastn = fs.existsSync(blastnLocal) ? blastnLocal : "blastn";
  const m = /blastn:\s*([\d.]+)\+?/.exec(await saidaDe(blastn, ["-version"]));
  // sem o '+' final: o rótulo na barra de estado já diz "BLAST+".
  if (m) versoes.blast = m[1]!;

  return versoes;
}
