---
conferido-em: 2026-11-12
---

# Testes isolados da máquina de quem usa

## Propósito

Testes e portões rodam sem tomar a máquina da pessoa que acompanha a sessão: o cursor, o foco, o som e o perfil
do navegador continuam dela.

## Comportamento atual e evidências

- Na corrida `novo2` da Estação Kepler (2026-11-12), a pessoa viu o mouse se mexer sozinho. A sessão não usou
  nenhuma ferramenta de controle de tela: conferido no transcript, só `Bash`, `Read`, `Write`, `Edit`, `Agent` e
  o Context7. O harness de E2E do jogo abre o Chrome do sistema pelo Playwright, em modo headless, e o jogo pede
  Pointer Lock. A causa provável é o Pointer Lock agindo sobre o cursor real no macOS. **Não confirmada**: na
  hora da conferência não havia E2E rodando.
- A [`testing.md`](../../../.claude/rules/common/testing.md) não diz nada sobre isolamento: a sessão desenha o
  harness sem essa restrição.

## Comportamento desejado

A `testing.md` ganha uma regra geral, sem nada de stack:

> Tests and gates run isolated from the machine of the person using it: headless or in their own window, without
> moving the cursor, stealing focus, playing sound or using the person's real browser profile. When a test needs
> one of these, it fakes that capability in test mode.

O detalhe da Estação Kepler (Pointer Lock no Chrome do sistema) fica no projeto dela, não no template.

## Contratos e documentos afetados

| Arquivo | Mudança |
| --- | --- |
| `.claude/rules/common/testing.md` | seção nova "Isolation" com a regra |
| `.claude/ecc-sync/manifest.json` | a nota `adaptation` do `testing.md` cita a regra |

## Critérios de aceite

1. A `testing.md` tem a regra: testes e portões isolados da máquina de quem usa, com os quatro itens (cursor,
   foco, som, perfil do navegador) e a saída "simule o recurso no modo de teste".
2. A nota `adaptation` do `testing.md` no manifest cita a regra de isolamento.
3. A busca por "Pointer Lock" em `.claude/` e no `CLAUDE.md` não acha nada: o detalhe de stack não entrou no
   template.

## Estratégia de testes e verificação

Texto de rule: conferido por leitura e busca, e por um `acceptance-verifier` novo. Sem `test-author`, porque não
há comportamento executável. O efeito (uma sessão desenhando um harness isolado) só aparece numa corrida real.

## Decisões

- **Regra geral no template, detalhe de stack no projeto** (decisão da pessoa, 2026-11-12: "pode fazer").
  Rejeitado: uma regra sobre Pointer Lock no template, que é agnóstico de stack.

## Plano de build

Uma fatia: a regra na `testing.md`, a nota do manifest, a conferência.

- [x] Fatia 1: regra, manifest, conferência por contexto limpo.
