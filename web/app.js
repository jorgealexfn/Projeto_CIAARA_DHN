// --- Estado Global da Aplicação ---
let dadosGlobais = {
    cursos: []
};
let cursoAtivoId = null;
let subTabAtiva = 'ranking'; // 'ranking', 'notas', ou 'adicionar'

// --- Funções de Comunicação com o Backend (Python) ---

// Função genérica para lidar com a resposta do backend
function handleResponse(response) {
    mostrarNotificacao(response.mensagem, response.status);
    if (response.status === 'sucesso' && response.dados) {
        dadosGlobais = response.dados; // Atualiza o estado global

        // Se um curso foi adicionado, torna-o ativo
        if (response.mensagem.includes("adicionado!") && response.mensagem.includes("Curso")) {
            cursoAtivoId = dadosGlobais.cursos[dadosGlobais.cursos.length - 1].id;
            subTabAtiva = 'ranking'; // Reseta para a aba de ranking
        }
        // Se o curso ativo foi removido, seleciona o primeiro (se houver)
        else if (dadosGlobais.cursos.length > 0 && !dadosGlobais.cursos.find(c => c.id === cursoAtivoId)) {
            cursoAtivoId = dadosGlobais.cursos[0].id;
        } else if (dadosGlobais.cursos.length === 0) {
            cursoAtivoId = null;
        }
        
        renderizarInterfaceCompleta();
    }
}

async function adicionarCurso() {
    const input = document.getElementById('input-novo-curso');
    const nomeCurso = input.value.trim();
    if (nomeCurso) {
        const response = await eel.add_curso(nomeCurso)();
        handleResponse(response);
        if (response.status === 'sucesso') {
            input.value = '';
        }
    } else {
        mostrarNotificacao("O nome do curso não pode ser vazio.", "erro");
    }
}

async function removerCurso(idCurso) {
    // Confirmação antes de remover
    if (confirm("Tem certeza que deseja remover este curso? Esta ação não pode ser desfeita.")) {
        const response = await eel.remove_curso(idCurso)();
        handleResponse(response);
    }
}

async function adicionarMateria(idCurso) {
    const nomeInput = document.getElementById(`materia-nome-${idCurso}`);
    const pesoInput = document.getElementById(`materia-peso-${idCurso}`);
    const avaliacoesInput = document.getElementById(`materia-avaliacoes-${idCurso}`);

    const nome = nomeInput.value.trim();
    const peso = parseFloat(pesoInput.value);
    const avaliacoes = parseInt(avaliacoesInput.value);

    if (nome && peso > 0 && avaliacoes > 0) {
        const response = await eel.add_materia(idCurso, nome, peso, avaliacoes)();
        handleResponse(response);
    } else {
        mostrarNotificacao("Dados da matéria inválidos. Verifique os campos.", "erro");
    }
}

async function removerMateria(idCurso, idMateria) {
    const response = await eel.remove_materia(idCurso, idMateria)();
    handleResponse(response);
}

async function adicionarAluno(idCurso) {
    const input = document.getElementById(`aluno-nome-${idCurso}`);
    const nome = input.value.trim();
    if (nome) {
        const response = await eel.add_aluno(idCurso, nome)();
        handleResponse(response);
    } else {
        mostrarNotificacao("O nome do aluno não pode ser vazio.", "erro");
    }
}

async function removerAluno(idCurso, idAluno) {
    const response = await eel.remove_aluno(idCurso, idAluno)();
    handleResponse(response);
}

async function salvarNotas(idCurso, idAluno) {
    const notasObj = {};
    const inputs = document.querySelectorAll(`.nota-input[data-aluno-id='${idAluno}']`);
    let hasError = false;

    inputs.forEach(input => {
        const idMateria = input.dataset.materiaId;
        const notasArray = input.value.split(',').map(n => n.trim()).filter(n => n !== '');
        
        for (const notaStr of notasArray) {
            const nota = parseFloat(notaStr);
            if (isNaN(nota) || nota < 0 || nota > 10) {
                mostrarNotificacao(`Nota inválida "${notaStr}". As notas devem ser números entre 0 e 10.`, "erro");
                input.classList.add('input-erro');
                hasError = true;
                return;
            }
            input.classList.remove('input-erro');
        }
        notasObj[idMateria] = input.value;
    });

    if (!hasError) {
        const response = await eel.salvar_notas_aluno(idCurso, idAluno, notasObj)();
        handleResponse(response);
    }
}


// --- Funções de Renderização da Interface ---

function renderizarInterfaceCompleta() {
    renderizarTabs();
    renderizarConteudoDoCurso();
}

function selecionarCurso(idCurso) {
    cursoAtivoId = idCurso;
    subTabAtiva = 'ranking'; // Sempre volta para a aba de ranking ao trocar de curso
    renderizarInterfaceCompleta();
}

function selecionarSubTab(nomeTab) {
    subTabAtiva = nomeTab;
    renderizarInterfaceCompleta();
}

function renderizarTabs() {
    const container = document.getElementById('tabs-container');
    container.innerHTML = '';

    if (!dadosGlobais.cursos || dadosGlobais.cursos.length === 0) {
        return;
    }

    dadosGlobais.cursos.forEach(curso => {
        const tabButton = document.createElement('button');
        tabButton.className = 'tab-button';
        tabButton.textContent = curso.nome;
        tabButton.onclick = () => selecionarCurso(curso.id);

        if (curso.id === cursoAtivoId) {
            tabButton.classList.add('active');
        }

        container.appendChild(tabButton);
    });
}

function renderizarConteudoDoCurso() {
    const container = document.getElementById('tab-content-container');
    container.innerHTML = '';

    if (!cursoAtivoId) {
        container.innerHTML = '<p class="aviso">Selecione um curso ou adicione um novo para começar.</p>';
        return;
    }

    const curso = dadosGlobais.cursos.find(c => c.id === cursoAtivoId);

    if (!curso) {
        console.error("Erro: Curso ativo não encontrado nos dados globais.");
        container.innerHTML = '<p class="aviso erro">Ocorreu um erro ao tentar exibir o curso selecionado.</p>';
        return;
    }

    let conteudoHtml = '';
    if (subTabAtiva === 'ranking') {
        conteudoHtml = renderizarRanking(curso.alunos);
    } else if (subTabAtiva === 'notas') {
        conteudoHtml = renderizarTabelaNotas(curso);
    } else if (subTabAtiva === 'adicionar') {
        conteudoHtml = `
            <div class="forms-adicao">
                ${renderizarFormAddMateria(curso.id)}
                ${renderizarFormAddAluno(curso.id)}
            </div>
        `;
    }

    const cursoCard = document.createElement('div');
    cursoCard.className = 'card curso-card';
    cursoCard.innerHTML = `
        <div class="curso-header">
            <h2>${curso.nome}</h2>
            <button class="btn-remover" onclick="removerCurso(${curso.id})">Remover Curso</button>
        </div>
        ${renderizarSubTabs()}
        <div id="sub-tab-content">
            ${conteudoHtml}
        </div>
    `;
    container.appendChild(cursoCard);
}

function renderizarSubTabs() {
    return `
        <div class="sub-tabs-container">
            <button 
                class="sub-tab-button ${subTabAtiva === 'ranking' ? 'active' : ''}" 
                onclick="selecionarSubTab('ranking')">
                Ranking
            </button>
            <button 
                class="sub-tab-button ${subTabAtiva === 'notas' ? 'active' : ''}" 
                onclick="selecionarSubTab('notas')">
                Tabela de Notas
            </button>
            <button 
                class="sub-tab-button ${subTabAtiva === 'adicionar' ? 'active' : ''}" 
                onclick="selecionarSubTab('adicionar')">
                Adicionar/Editar
            </button>
        </div>
    `;
}

// --- Funções de Renderização de Componentes (reutilizadas) ---

function renderizarRanking(alunos) {
    if (!alunos || alunos.length === 0) return '<h3>Ranking</h3><p>Nenhum aluno no curso.</p>';
    
    let rankingHtml = '<h3>Ranking</h3><ol>';
    alunos.forEach((aluno, index) => {
        rankingHtml += `<li><strong>${index + 1}º</strong> - ${aluno.nome} (Média Final: ${aluno.media_final.toFixed(2)})</li>`;
    });
    rankingHtml += '</ol>';
    return rankingHtml;
}

function renderizarTabelaNotas(curso) {
    if (curso.materias.length === 0) return '<h3>Tabela de Notas</h3><p class="aviso">Adicione matérias para poder lançar as notas.</p>';
    
    let tabelaHtml = `
        <h3>Tabela de Notas</h3>
        <div class="tabela-container">
            <table>
                <thead>
                    <tr>
                        <th>Aluno</th>
                        ${curso.materias.map(m => `<th>${m.nome} (Peso ${m.peso}) <button class="btn-remover-small" onclick="removerMateria(${curso.id}, ${m.id})">X</button></th>`).join('')}
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (curso.alunos.length > 0) {
        curso.alunos.forEach(aluno => {
            tabelaHtml += `
                <tr>
                    <td>${aluno.nome} <button class="btn-remover-small" onclick="removerAluno(${curso.id}, ${aluno.id})">X</button></td>
                    ${curso.materias.map(materia => `
                        <td>
                            <input 
                                type="text" 
                                class="nota-input"
                                placeholder="Ex: 7.5, 8, 9"
                                data-aluno-id="${aluno.id}"
                                data-materia-id="${materia.id}"
                                value="${(aluno.notas[materia.id] || []).join(', ')}">
                        </td>
                    `).join('')}
                    <td><button onclick="salvarNotas(${curso.id}, ${aluno.id})">Salvar</button></td>
                </tr>
            `;
        });
    } else {
        tabelaHtml += `<tr><td colspan="${curso.materias.length + 2}">Nenhum aluno cadastrado.</td></tr>`;
    }

    tabelaHtml += '</tbody></table></div>';
    return tabelaHtml;
}

function renderizarFormAddMateria(idCurso) {
    return `
        <div class="add-form-inner">
            <h4>Adicionar Matéria</h4>
            <input type="text" id="materia-nome-${idCurso}" placeholder="Nome da Matéria">
            <input type="number" id="materia-peso-${idCurso}" placeholder="Peso" value="1.0" step="0.1">
            <input type="number" id="materia-avaliacoes-${idCurso}" placeholder="Nº de Avaliações" value="3" min="1">
            <button onclick="adicionarMateria(${idCurso})">Adicionar Matéria</button>
        </div>
    `;
}

function renderizarFormAddAluno(idCurso) {
    return `
        <div class="add-form-inner">
            <h4>Adicionar Aluno</h4>
            <input type="text" id="aluno-nome-${idCurso}" placeholder="Nome do Aluno">
            <button onclick="adicionarAluno(${idCurso})">Adicionar Aluno</button>
        </div>
    `;
}

// --- Funções Utilitárias da Interface ---

function mostrarNotificacao(mensagem, tipo = "sucesso") {
    const notificacao = document.getElementById('notificacao');
    notificacao.textContent = mensagem;
    notificacao.className = tipo;

    setTimeout(() => {
        notificacao.className = 'hidden';
    }, 3000);
}

// --- Ponto de Entrada ---

window.onload = async function() {
    const response = await eel.get_dados_completos()();
    if (response.status === 'sucesso' && response.dados) {
        dadosGlobais = response.dados;
        if (dadosGlobais.cursos.length > 0) {
            cursoAtivoId = dadosGlobais.cursos[0].id;
        }
        renderizarInterfaceCompleta();
    } else {
        handleResponse(response); // Mostra erro se o carregamento inicial falhar
    }
};
