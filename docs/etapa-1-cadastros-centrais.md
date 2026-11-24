# Etapa 1 — cadastros centrais (relatório)

Escopo combinado: o login e as senhas de usuário **ficam como estão** (migração para Firebase Authentication será feita depois pelo responsável).

## O que foi implementado
Menu **Cadastro**, grupos novos, todos no mesmo motor de consulta/cadastro (código sequencial, inativação sem exclusão, auditoria, impressão):

| Tela | Código | Para quê |
|---|---|---|
| Assistência › Especialidades | ESP | Especialidades médicas, de enfermagem e multiprofissionais |
| Assistência › Unidades Assistenciais | UAS | Unidades e alas (internação, UTI, pronto atendimento...) |
| Assistência › Quartos e Leitos | LEI | Leitos ADICIONAIS à estrutura padrão |
| Apoio › Equipamentos | EQP | Bens e equipamentos, patrimônio, setor e situação |
| Apoio › Serviços | SRV | Serviços e tipo de gestão (própria, terceirizada, compartilhada, externa) |
| Apoio › Convênios | CNV | SUS, convênios e fontes pagadoras |
| Apoio › Protocolos e Documentos | DOC | Documentos institucionais com versão, vigência e responsável |

Também: campo **Especialidade** no cadastro de Funcionário (aba Adicionais).

## Leitos cadastráveis
`estruturaHospital()` agora junta a estrutura padrão (4 andares, A/B) aos leitos ativos cadastrados. O leito novo aparece no Mapa de Ocupação, na internação, no prontuário e nos relatórios, sem cadastro paralelo. O identificador (quarto + letra/número) não pode repetir um leito padrão nem outro cadastrado. Leito inativado sai do mapa; o histórico fica.

## Correção
`Parâmetros do Sistema` buscava por um campo (`descricao`) que não existe; agora busca por chave e valor.

## Testes
37 testes passam (novo: leitos adicionais e colisão de identificador). No navegador, com Firestore simulado: criação de unidade e de leito, bloqueio de leito repetido (305-B), leito novo no mapa (345 leitos), abertura das 7 telas e permissões (Enfermagem vê e não cria; Portaria não vê).

## Pendente
A lista de pendências é cumulativa e fica em [pendencias.md](pendencias.md) (Etapas 1, 2 e as seguintes).
