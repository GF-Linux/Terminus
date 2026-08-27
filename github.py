
#* Integrar fluxo dos atalhos GitHub no terminal


class GitHubShortcuts:
    
    def __init__(self):
        self.comandos = [
            "git clone",
            "git status",
            "git add .",
            "git commit -m 'mensagem'",
            "git push",
            "git pull"
        ]

    def listar_comandos(self):
        return self.comandos

    def executar_comando(self, comando): #* Executa um comando no terminal 

        try:
            import os
            os.system(comando) 
        except Exception as e:
            print(f"Erro ao executar o comando: {e}")

    def executar_comando_se_existir(self, comando):
        if comando in self.comandos:
            self.executar_comando(comando)
        else:
            print(f"Comando '{comando}' não está na lista de atalhos.")


class GithubCLI(GitHubShortcuts):
    def __init__(self):
        super().__init__()


    def git_clone(self, url):

        comando = f"git clone {url}"
        self.executar_comando_se_existir(comando)


    def git_status(self):
        comando = "git status"
        self.executar_comando_se_existir(comando)

    def git_add(self):
        comando = "git add ."
        self.executar_comando_se_existir(comando)

    def git_commit(self, mensagem):
        comando = f"git commit -m '{mensagem}'"
        self.executar_comando_se_existir(comando)

    def git_push(self):
        comando = "git push"
        self.executar_comando_se_existir(comando)

    def git_pull(self):
        comando = "git pull"
        self.executar_comando_se_existir(comando)



teste1 = GithubCLI()
teste1.git_status()