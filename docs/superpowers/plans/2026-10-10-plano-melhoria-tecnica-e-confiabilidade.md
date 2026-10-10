# Plano de Melhoria Técnica e Confiabilidade — Charlie AI

**Status do projeto:** Em desenvolvimento ativo  
**Objetivo:** Aumentar a segurança, a confiabilidade e a capacidade de manutenção do Charlie sem interromper desnecessariamente o desenvolvimento do ecossistema.

---

## 1. Contexto e objetivo

O Charlie é um assistente de IA composto por diferentes componentes, incluindo backend Python com FastAPI, frontend web, aplicativo mobile, aplicativo desktop com Tauri, sistema de memória, provedores de modelos de IA, ferramentas e recursos de voz.

O projeto já possui uma arquitetura modular, documentação técnica, testes automatizados e mecanismos de tratamento de falhas. Entretanto, a auditoria técnica identificou oportunidades de melhoria relacionadas à segurança, à cobertura de testes, à automação de qualidade, à configuração e à observabilidade.

Como o ecossistema ainda está em desenvolvimento, as melhorias devem ser implementadas progressivamente, priorizando os riscos reais e aproveitando os recursos que já existem.

**Princípio orientador:** fortalecer a confiabilidade do Charlie durante seu desenvolvimento, sem transformar melhorias secundárias em bloqueios desnecessários para a conclusão do produto.

---

## 2. Prioridade alta — Segurança e isolamento entre usuários

### Objetivo

Garantir que cada usuário só possa acessar seus próprios dados e executar ações para as quais tenha autorização.

### Pontos a investigar

* Isolamento entre conversas de usuários diferentes.
* Isolamento de memórias semânticas e preferências.
* Autenticação e autorização em todas as rotas privadas.
* Controle de acesso às ferramentas executadas pelo agente.
* Proteção de tokens, chaves de API e outras credenciais.
* Segurança das operações que utilizam identificadores fornecidos pelo cliente.
* Tratamento de sessões expiradas, tokens inválidos e tentativas de acesso não autorizado.

### Ações recomendadas

1. Auditar as rotas da API que acessam dados específicos de usuários.
2. Verificar se a identidade utilizada para autorizar uma operação vem de uma fonte confiável, e não apenas de um identificador enviado pelo cliente.
3. Criar testes negativos de autorização.
4. Verificar se a memória semântica aplica os filtros de usuário em todas as operações relevantes.
5. Testar os limites de autorização das ferramentas disponíveis.
6. Garantir que erros de autenticação não revelem dados de outros usuários.
7. Revisar a exposição de credenciais em código, configurações, respostas da API e logs.

### Exemplo de teste

* O usuário A cria uma conversa.
* O usuário B tenta acessar essa conversa utilizando seu identificador.
* A API deve negar o acesso.
* O usuário B também tenta recuperar mensagens ou memórias relacionadas à conversa de A.
* Todas as operações não autorizadas devem ser bloqueadas.

### Critério de conclusão

Os fluxos críticos de autenticação e autorização possuem testes automatizados que demonstram o comportamento esperado, incluindo tentativas de acesso não autorizado.

**Observação:** a existência de testes de isolamento não comprova, por si só, que todas as rotas estão protegidas. A cobertura precisa ser verificada.

---

## 3. Prioridade alta — Testes de integração entre os componentes

### Objetivo

Detectar falhas nas interações entre módulos e impedir que alterações em um componente quebrem funcionalidades já existentes.

### Tipos de teste

**Testes unitários:** verificam funções e componentes isoladamente.

**Testes de API:** verificam o comportamento das rotas HTTP, incluindo entradas, respostas e erros.

**Testes de integração:** verificam a comunicação entre diferentes partes do sistema.

**Testes end-to-end (E2E):** verificam fluxos completos, simulando o percurso de uma operação do ponto de vista do usuário.

### Fluxos prioritários

1. Autenticação e recuperação da sessão.
2. Envio de mensagens e recebimento de respostas por streaming.
3. Persistência e recuperação do histórico.
4. Isolamento entre usuários e conversas.
5. Execução de ferramentas pelo agente.
6. Tratamento de falhas dos provedores de IA.
7. Funcionamento dos mecanismos de fallback.
8. Recuperação de conversas após reinicialização ou reconexão.
9. Comunicação entre cada interface e o backend.

### Ações recomendadas

* Identificar quais fluxos já possuem testes.
* Priorizar os caminhos críticos e os comportamentos que podem causar regressões.
* Criar testes HTTP para as rotas relevantes.
* Adicionar testes de integração entre API, pipeline, memória e provedores.
* Criar testes E2E para os fluxos essenciais do web chat.
* Ampliar a cobertura para o mobile e o desktop conforme a integração desses componentes for concluída.
* Testar cenários de erro, timeout, desconexão e indisponibilidade de serviços externos.

### Critério de conclusão

Os principais fluxos do Charlie possuem testes reproduzíveis, e as regressões mais importantes podem ser detectadas sem depender exclusivamente de testes manuais.

**Importante:** não é necessário buscar uma porcentagem arbitrária de cobertura. A prioridade é testar comportamentos relevantes e riscos concretos.

---

## 4. Prioridade média-alta — Validação de configuração

### Objetivo

Detectar configurações inválidas durante a inicialização, evitando falhas tardias e erros difíceis de diagnosticar.

### Problema a investigar

O relatório identificou variáveis de ambiente que utilizam valores padrão vazios, como chaves de provedores de IA e configurações do banco de dados.

Essa abordagem pode ser válida, desde que o sistema verifique quais valores são obrigatórios para cada ambiente e recurso utilizado.

### Ações recomendadas

1. Identificar as variáveis obrigatórias e opcionais.
2. Validar os nomes dos provedores de IA suportados.
3. Validar formatos de URLs, portas e outros parâmetros relevantes.
4. Verificar configurações necessárias antes de iniciar funcionalidades dependentes delas.
5. Exibir mensagens de erro claras quando uma configuração obrigatória estiver ausente ou inválida.
6. Evitar que mensagens de erro exponham segredos.
7. Diferenciar configurações de desenvolvimento, produção, desktop e provedores locais.
8. Criar testes para configurações válidas, ausentes e malformadas.

### Exemplo

Se o Charlie estiver configurado para utilizar um provedor remoto que exige uma chave de API, a inicialização ou ativação desse provedor deverá detectar a ausência da chave e informar o problema claramente.

Entretanto, se o usuário estiver utilizando um provedor local que não exige essa credencial, a configuração não deverá ser rejeitada por uma dependência desnecessária.

### Critério de conclusão

Configurações inválidas são detectadas de maneira previsível, com mensagens úteis e sem exposição de informações sensíveis.

---

## 5. Prioridade média-alta — CI com GitHub Actions

### Objetivo

Automatizar verificações de qualidade e testes para detectar regressões durante o desenvolvimento.

### Contexto atual

A auditoria não encontrou workflows de CI no GitHub, embora tenha identificado testes executáveis localmente e scripts de automação de deploy.

Portanto, a lacuna principal não é necessariamente a ausência de testes, mas a falta de execução automatizada dessas verificações no processo de integração do código.

### Ações recomendadas

#### Backend Python

* Configurar o ambiente Python e instalar as dependências de maneira reproduzível.
* Executar os testes automatizados existentes.
* Adicionar verificações de qualidade e tipagem, caso estejam configuradas.
* Verificar se os módulos críticos podem ser importados e inicializados corretamente.

#### Frontend web

* Instalar as dependências a partir do lockfile correspondente.
* Executar lint e verificações de tipos, quando disponíveis.
* Executar o build de produção.

#### Desktop com Tauri

* Executar verificações aplicáveis ao frontend.
* Verificar a compilação do código Rust.
* Executar o build do aplicativo quando as dependências do sistema estiverem disponíveis no ambiente de CI.

#### Aplicativo mobile

* Executar verificações de tipos e lint.
* Executar os testes automatizados disponíveis.
* Adicionar builds automatizados quando a configuração do projeto e os requisitos de compilação estiverem definidos.

### Fluxo recomendado

1. O desenvolvedor realiza alterações localmente.
2. Executa suas verificações habituais.
3. Envia a branch ao GitHub.
4. O GitHub Actions executa as verificações automatizadas.
5. Se houver falhas, o desenvolvedor investiga e corrige os problemas.
6. Quando os checks forem aprovados, o código poderá ser integrado conforme as regras do repositório.

Inicialmente, os workflows podem ser separados por componente, evitando builds desnecessários.

### Evolução posterior

Depois de estabilizar os testes e builds, avaliar:

* Proteção da branch principal.
* Exigência de checks aprovados antes do merge.
* Geração automatizada de artefatos.
* Publicação automatizada dos componentes apropriados.
* Processo formal de releases.

### Critério de conclusão

As verificações essenciais são executadas automaticamente no GitHub, e falhas nos checks ficam visíveis antes da integração das alterações.

**Escopo inicial:** implementar CI. A automação completa de publicação e entrega pode ser adicionada posteriormente.

---

## 6. Prioridade média — Observabilidade

### Objetivo

Facilitar a identificação de falhas, gargalos de desempenho e problemas de integração no Charlie.

### Contexto

O relatório identificou health checks e registros de eventos, mas não encontrou um sistema abrangente de métricas, rastreamento distribuído e logs estruturados.

Para um sistema que combina IA, memória, streaming, ferramentas e diferentes provedores, essa limitação pode tornar o diagnóstico de falhas mais demorado.

### Primeira etapa: logs estruturados

Avaliar a adoção de logs estruturados e consistentes, contendo campos como:

* `request_id`: identificador da requisição.
* `stage`: etapa do pipeline.
* `duration_ms`: duração da operação.
* `provider`: provedor utilizado, quando aplicável.
* `status`: resultado da operação.
* `fallback_used`: indicação de utilização de fallback.
* `error_type`: categoria do erro, quando houver.

Os campos devem ser adaptados à arquitetura existente. Não é necessário adicionar todos os campos a todos os eventos.

### Segunda etapa: medição de latência

Medir o tempo gasto em etapas importantes, como:

* Recuperação de memória.
* Roteamento de modelos.
* Chamadas aos provedores.
* Execução de ferramentas.
* Processamento e emissão de respostas por streaming.
* Persistência de dados.

Essas informações permitirão identificar quais etapas contribuem mais para a latência percebida pelo usuário.

### Terceira etapa: rastreamento e métricas

Quando houver necessidade operacional, avaliar:

* Métricas agregadas de latência e falhas.
* Rastreamento distribuído com OpenTelemetry.
* Monitoramento de disponibilidade dos serviços.
* Alertas para falhas recorrentes ou degradação de desempenho.

Não é necessário implementar uma infraestrutura completa de observabilidade antes de haver uma necessidade concreta.

### Privacidade

Os logs não devem registrar indiscriminadamente mensagens completas, tokens, chaves de API ou outros dados sensíveis.

### Critério de conclusão

Os problemas mais importantes podem ser investigados utilizando registros consistentes e informações suficientes para identificar a etapa em que ocorreram.

---

## 7. Melhoria arquitetural — Contratos explícitos entre API e interfaces

### Objetivo

Reduzir incompatibilidades entre o backend e os diferentes clientes do Charlie.

### Contexto

O Charlie possui múltiplas interfaces que dependem dos mesmos serviços. Alterações nos formatos de entrada ou saída da API podem provocar falhas em clientes que ainda esperam o contrato anterior.

### Ações recomendadas

1. Verificar como os contratos atuais da API estão documentados.
2. Revisar os modelos Pydantic utilizados nas entradas e respostas.
3. Aproveitar o esquema OpenAPI gerado pelo FastAPI.
4. Avaliar a geração de tipos TypeScript a partir dos contratos da API.
5. Criar testes para validar os formatos das respostas importantes.
6. Definir um procedimento para alterações incompatíveis.
7. Testar os fluxos compartilhados entre web, mobile e desktop.

A geração automática de tipos é uma opção, não uma exigência. Se a documentação e os contratos atuais já forem suficientes, a mudança poderá ser adiada.

### Critério de conclusão

Os contratos das operações importantes estão documentados e existem verificações que ajudam a detectar incompatibilidades entre backend e clientes.

---

## 8. Gestão de dependências

### Objetivo

Manter a instalação do projeto previsível, evitando divergências entre desenvolvimento local e ambientes de execução.

### Contexto

A auditoria identificou três arquivos relevantes:

* `pyproject.toml`: declaração de dependências e configurações do projeto.
* `uv.lock`: resolução das versões utilizadas pelo `uv`.
* `requirements.txt`: subconjunto de dependências destinado ao ambiente de deploy na Vercel.

A presença desses três arquivos não constitui, por si só, um problema. Eles podem atender a finalidades distintas.

### Ações recomendadas

1. Documentar a finalidade de cada arquivo.
2. Confirmar como o ambiente da Vercel instala as dependências.
3. Verificar se todas as dependências necessárias ao backend estão disponíveis no ambiente de deploy.
4. Identificar pacotes declarados que não são mais utilizados.
5. Confirmar se os processos de instalação são reproduzíveis.
6. Evitar manter declarações duplicadas sem uma justificativa clara.
7. Incluir verificações de instalação no CI.

A remoção de uma dependência deve ser precedida de uma análise de uso e de testes. Um pacote aparentemente não utilizado pode ser necessário indiretamente ou em um caminho específico de execução.

### Critério de conclusão

Cada arquivo possui uma finalidade clara, os ambientes podem ser reproduzidos e as diferenças entre desenvolvimento e deploy são intencionais e documentadas.

---

## 9. Ordem de implementação recomendada

A ordem abaixo é uma orientação inicial, não uma sequência rígida.

### Etapa 1 — Segurança e comportamentos críticos

* Revisar autenticação e autorização.
* Verificar isolamento de usuários e conversas.
* Revisar a autorização das ferramentas.
* Corrigir vulnerabilidades confirmadas.
* Garantir testes para os comportamentos críticos.

### Etapa 2 — Integração e testes

* Mapear os fluxos essenciais.
* Identificar lacunas de cobertura.
* Adicionar testes HTTP e de integração prioritários.
* Ampliar os testes conforme mobile e Tauri forem integrados.
* Verificar tratamento de erros e mecanismos de fallback.

### Etapa 3 — Configuração e CI

* Validar configurações obrigatórias.
* Documentar as dependências por ambiente.
* Configurar GitHub Actions.
* Automatizar os testes existentes.
* Adicionar verificações de qualidade e builds gradualmente.

### Etapa 4 — Contratos e diagnóstico

* Revisar os contratos da API.
* Avaliar geração de tipos para os clientes.
* Melhorar logs estruturados.
* Medir a latência das etapas críticas.

### Etapa 5 — Preparação para o lançamento

* Executar testes de integração e E2E dos fluxos essenciais.
* Revisar segurança e privacidade.
* Verificar builds e instalação de cada componente.
* Documentar limitações conhecidas.
* Definir critérios para o primeiro release estável.
* Avaliar a automação de publicação e distribuição.

---

## 10. Critérios gerais de conclusão

Antes de considerar o ecossistema pronto para um lançamento público, avaliar se:

* Os fluxos essenciais funcionam de ponta a ponta.
* A autenticação e a autorização foram verificadas nos caminhos críticos.
* O isolamento entre usuários possui testes adequados.
* As falhas dos provedores e serviços externos são tratadas de forma previsível.
* Os testes automatizados relevantes estão passando.
* O CI executa as verificações essenciais.
* Os contratos entre backend e clientes estão suficientemente definidos.
* As configurações necessárias são validadas.
* Os builds e procedimentos de instalação foram verificados.
* Os problemas conhecidos e as limitações relevantes estão documentados.
* Existe uma maneira razoável de investigar falhas sem expor dados sensíveis.

Esses critérios devem ser adaptados ao escopo real da primeira versão. Nem toda funcionalidade experimental precisa estar pronta para o lançamento, desde que suas limitações sejam compreendidas e não comprometam a segurança ou os fluxos essenciais.

---

## 11. Princípios de engenharia a preservar

1. **Corrigir problemas comprovados antes de perseguir melhorias especulativas.**
2. **Não confundir funcionalidades ainda não implementadas com defeitos de implementação.**
3. **Não confundir ausência de automação com ausência de testes.**
4. **Automatizar verificações progressivamente, aproveitando a estrutura existente.**
5. **Priorizar comportamentos críticos em vez de perseguir métricas de cobertura arbitrárias.**
6. **Evitar complexidade operacional que não resolva uma necessidade real.**
7. **Manter documentação das decisões arquiteturais e das mudanças importantes.**
8. **Preservar um fluxo de desenvolvimento que permita iterar rapidamente.**
9. **Reavaliar prioridades conforme o ecossistema amadurecer.**
10. **Basear conclusões de auditoria em evidências reproduzíveis.**

---

## Conclusão

O objetivo deste plano não é interromper o desenvolvimento do Charlie para implementar todas as práticas possíveis de engenharia.

A proposta é fortalecer gradualmente a segurança, a confiabilidade e a capacidade de manutenção do sistema, começando pelos riscos mais importantes e pelas melhorias com maior impacto.

A prioridade inicial é verificar os controles de segurança, ampliar os testes dos fluxos críticos e introduzir CI para automatizar as verificações existentes. Em paralelo, a integração do mobile e do desktop deve continuar.

Conforme o ecossistema se estabilizar, o projeto poderá evoluir para uma API com contratos mais explícitos, melhor observabilidade e processos mais maduros de versionamento e entrega.

**Resultado esperado:** um Charlie cujo desenvolvimento continue ágil, mas cuja evolução seja progressivamente mais verificável, previsível e segura.
