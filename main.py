import eel
import json
import time
import os

# Inicializa o Eel, apontando para a pasta que contém os arquivos da interface
eel.init('web')

# --- Funções Auxiliares ---

def verificar_permissoes():
    """Verifica se o arquivo de banco de dados pode ser criado e escrito."""
    db_file = 'database.json'
    # Tenta criar o arquivo se ele não existir
    if not os.path.exists(db_file):
        try:
            with open(db_file, 'w') as f:
                f.write('{"cursos": []}')
        except (IOError, PermissionError) as e:
            print(f"ERRO CRÍTICO: Não foi possível criar 'database.json'. Verifique as permissões da pasta. Erro: {e}")
            return False
    
    # Tenta ler e escrever no arquivo
    if not os.access('.', os.W_OK) or not os.access(db_file, os.W_OK):
        print(f"ERRO CRÍTICO: O script não tem permissão para escrever no arquivo '{db_file}' ou na pasta atual.")
        return False
        
    return True

def carregar_dados():
    """Lê os dados do arquivo JSON. Se não existir ou estiver vazio, cria uma estrutura."""
    db_file = 'database.json'
    try:
        with open(db_file, 'r', encoding='utf-8') as f:
            content = f.read()
            if not content:
                return {"cursos": []}
            return json.loads(content)
    except (FileNotFoundError, json.JSONDecodeError):
        # Se falhar, tenta criar um arquivo base
        with open(db_file, 'w', encoding='utf-8') as f:
            json.dump({"cursos": []}, f)
        return {"cursos": []}

def salvar_dados(dados):
    """Salva os dados no arquivo JSON. Retorna True em sucesso, False em falha."""
    try:
        with open('database.json', 'w', encoding='utf-8') as f:
            json.dump(dados, f, indent=4, ensure_ascii=False)
        return True
    except (IOError, PermissionError) as e:
        print(f"ERRO CRÍTICO: Não foi possível salvar 'database.json'. Erro: {e}")
        return False

def gerar_id_unico():
    """Gera um ID único baseado no timestamp atual."""
    return int(time.time() * 1000)

def recalcular_medias_e_ranking(curso):
    """Calcula a média ponderada final para cada aluno e ordena o ranking."""
    materias_curso = {m['id']: m for m in curso.get('materias', [])}
    for aluno in curso.get('alunos', []):
        soma_notas_ponderadas, soma_pesos = 0, 0
        for id_materia_str, notas_aluno in aluno.get('notas', {}).items():
            id_materia = int(id_materia_str)
            if id_materia in materias_curso:
                materia_info = materias_curso[id_materia]
                peso_materia = materia_info.get('peso', 1.0)
                notas_validas = [float(n) for n in notas_aluno if isinstance(n, (int, float))]
                if notas_validas:
                    media_materia = sum(notas_validas) / len(notas_validas)
                    soma_notas_ponderadas += media_materia * peso_materia
                    soma_pesos += peso_materia
        aluno['media_final'] = round(soma_notas_ponderadas / soma_pesos, 2) if soma_pesos > 0 else 0
    curso['alunos'].sort(key=lambda x: x.get('media_final', 0), reverse=True)
    return curso

def criar_resposta(sucesso, mensagem, dados_atuais):
    """Cria um objeto de resposta padronizado para o frontend."""
    status = "sucesso" if sucesso else "erro"
    for curso in dados_atuais.get('cursos', []):
        recalcular_medias_e_ranking(curso)
    # Log de depuração para ver o que está sendo enviado
    print(f"DEBUG: Enviando resposta para o frontend -> Status: {status}, Mensagem: {mensagem}")
    return {"status": status, "mensagem": mensagem, "dados": dados_atuais}

# --- Funções Expostas para o JavaScript (API do Backend) ---

@eel.expose
def get_dados_completos():
    """Retorna todos os dados para a interface."""
    dados = carregar_dados()
    return criar_resposta(True, "Dados carregados com sucesso.", dados)

@eel.expose
def add_curso(nome_curso):
    """Adiciona um novo curso."""
    if not nome_curso or not nome_curso.strip():
        return criar_resposta(False, "O nome do curso não pode ser vazio.", carregar_dados())
    dados = carregar_dados()
    dados['cursos'].append({"id": gerar_id_unico(), "nome": nome_curso, "materias": [], "alunos": []})
    if salvar_dados(dados):
        # MUDANÇA: Retorna a variável 'dados' que já está em memória e atualizada.
        return criar_resposta(True, f"Curso '{nome_curso}' adicionado!", dados)
    else:
        # Em caso de falha ao salvar, recarrega os dados do disco para garantir consistência.
        return criar_resposta(False, "Falha ao salvar o arquivo de dados.", carregar_dados())

@eel.expose
def remove_curso(id_curso):
    """Remove um curso pelo ID."""
    dados = carregar_dados()
    dados['cursos'] = [c for c in dados['cursos'] if c['id'] != id_curso]
    if salvar_dados(dados):
        return criar_resposta(True, "Curso removido.", dados)
    else:
        return criar_resposta(False, "Falha ao salvar o arquivo de dados.", carregar_dados())

@eel.expose
def add_materia(id_curso, nome_materia, peso, avaliacoes):
    """Adiciona uma nova matéria a um curso."""
    dados = carregar_dados()
    for curso in dados['cursos']:
        if curso['id'] == id_curso:
            curso['materias'].append({"id": gerar_id_unico(), "nome": nome_materia, "peso": float(peso), "avaliacoes": int(avaliacoes)})
            break
    if salvar_dados(dados):
        return criar_resposta(True, f"Matéria '{nome_materia}' adicionada.", dados)
    else:
        return criar_resposta(False, "Falha ao salvar o arquivo de dados.", carregar_dados())

@eel.expose
def remove_materia(id_curso, id_materia):
    """Remove uma matéria e as notas associadas."""
    dados = carregar_dados()
    for curso in dados['cursos']:
        if curso['id'] == id_curso:
            curso['materias'] = [m for m in curso['materias'] if m['id'] != id_materia]
            for aluno in curso['alunos']:
                aluno['notas'].pop(str(id_materia), None)
            break
    if salvar_dados(dados):
        return criar_resposta(True, "Matéria removida.", dados)
    else:
        return criar_resposta(False, "Falha ao salvar o arquivo de dados.", carregar_dados())

@eel.expose
def add_aluno(id_curso, nome_aluno):
    """Adiciona um novo aluno a um curso."""
    dados = carregar_dados()
    for curso in dados['cursos']:
        if curso['id'] == id_curso:
            notas_iniciais = {str(m['id']): [] for m in curso['materias']}
            curso['alunos'].append({"id": gerar_id_unico(), "nome": nome_aluno, "notas": notas_iniciais, "media_final": 0})
            break
    if salvar_dados(dados):
        return criar_resposta(True, f"Aluno '{nome_aluno}' adicionado.", dados)
    else:
        return criar_resposta(False, "Falha ao salvar o arquivo de dados.", carregar_dados())

@eel.expose
def remove_aluno(id_curso, id_aluno):
    """Remove um aluno de um curso."""
    dados = carregar_dados()
    for curso in dados['cursos']:
        if curso['id'] == id_curso:
            curso['alunos'] = [a for a in curso['alunos'] if a['id'] != id_aluno]
            break
    if salvar_dados(dados):
        return criar_resposta(True, "Aluno removido.", dados)
    else:
        return criar_resposta(False, "Falha ao salvar o arquivo de dados.", carregar_dados())

@eel.expose
def salvar_notas_aluno(id_curso, id_aluno, notas_obj):
    """Salva todas as notas de um aluno."""
    dados = carregar_dados()
    for curso in dados['cursos']:
        if curso['id'] == id_curso:
            for aluno in curso['alunos']:
                if aluno['id'] == id_aluno:
                    for id_materia, notas_str in notas_obj.items():
                        notas_limpas = []
                        if notas_str.strip():
                            for n_str in notas_str.split(','):
                                try:
                                    nota = float(n_str.strip())
                                    if 0 <= nota <= 10:
                                        notas_limpas.append(nota)
                                except (ValueError, TypeError):
                                    continue
                        aluno['notas'][id_materia] = notas_limpas
                    break
            break
    if salvar_dados(dados):
        return criar_resposta(True, "Notas salvas com sucesso!", dados)
    else:
        return criar_resposta(False, "Falha ao salvar o arquivo de dados.", carregar_dados())

# --- Ponto de Entrada da Aplicação ---
if __name__ == '__main__':
    if verificar_permissoes():
        print("Iniciando aplicação... Se o navegador não abrir, acesse http://localhost:8000/index.html")
        eel.start('index.html', size=(1280, 800), port=8000, mode='default')
    else:
        print("\nO programa será encerrado devido a um erro de permissão.")
        # Mantém terminal aberto por alguns segundos para o utilizador poder ler a mensagem
        time.sleep(10)
