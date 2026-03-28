# Questionário Profissional de Perfil de Investidor (Suitability)

**Padrão inspirado em práticas de corretoras e diretrizes da ANBIMA**

Este documento define um **questionário profissional de perfil de
risco** utilizado para classificar investidores em:

- Conservador
- Moderado
- Agressivo

O questionário foi estruturado para uso em **plataformas digitais,
robo-advisors e sistemas SaaS financeiros**.

---

# Objetivo do Questionário

Avaliar três dimensões fundamentais:

1.  **Tolerância ao risco (Psicológica)**
2.  **Capacidade financeira para risco**
3.  **Horizonte e objetivos de investimento**

Cada resposta possui uma **pontuação entre 0 e 5**.

A soma final gera o **perfil do investidor**.

---

# Estrutura do Questionário

Total de perguntas: **18**\
Pontuação máxima: **90 pontos**

Distribuição:

Dimensão Perguntas

---

Tolerância psicológica 1 -- 7
Capacidade financeira 8 -- 13
Horizonte e objetivos 14 -- 18

---

# Perguntas

## 1. Qual sua experiência com investimentos?

Resposta Pontos

---

Nenhuma 0
Apenas poupança ou renda fixa simples 1
Fundos de investimento 3
Ações ou FIIs 4
Ações, derivativos ou cripto 5

---

## 2. Como você reagiria se seu investimento caísse 10%?

Resposta Pontos

---

Resgataria imediatamente 0
Ficaria muito preocupado 1
Aguardaria recuperação 3
Compraria mais 5

---

## 3. Se sua carteira caísse 20% em um ano, você:

Resposta Pontos

---

Venderia tudo 0
Reduziria exposição 2
Manteria posição 4
Investiria mais 5

---

## 4. Qual frase melhor descreve seu comportamento como investidor?

Resposta Pontos

---

Prefiro não correr riscos 0
Aceito pouco risco 2
Aceito risco moderado 4
Busco alto retorno mesmo com risco 5

---

## 5. Qual volatilidade você tolera?

Resposta Pontos

---

Quase nenhuma 0
Baixa 2
Moderada 4
Alta 5

---

## 6. Você já passou por ciclos de mercado (crises)?

Resposta Pontos

---

Nunca investi 0
Não 1
Sim, parcialmente 3
Sim, várias vezes 5

---

## 7. Seu conhecimento sobre investimentos é:

Resposta Pontos

---

Básico 1
Intermediário 3
Avançado 5

---

# Capacidade Financeira

## 8. Qual percentual da sua renda mensal é investido?

Resposta Pontos

---

Menos de 5% 0
5--10% 2
10--20% 4
Mais de 20% 5

---

## 9. Quantos meses de reserva de emergência você possui?

Resposta Pontos

---

Nenhuma 0
Até 3 meses 2
3--6 meses 4
Mais de 6 meses 5

---

## 10. Sua renda principal depende desses investimentos?

Resposta Pontos

---

Sim 0
Parcialmente 2
Não 5

---

## 11. Qual sua estabilidade de renda?

Resposta Pontos

---

Instável 0
Moderada 3
Estável 5

---

## 12. Quanto do seu patrimônio está investido?

Resposta Pontos

---

Mais de 80% 0
50--80% 2
20--50% 4
Menos de 20% 5

---

## 13. Caso perca 20% do capital investido:

Resposta Pontos

---

Afetaria seriamente minha vida 0
Afetaria parcialmente 2
Teria impacto limitado 4
Não afetaria 5

---

# Horizonte e Objetivos

## 14. Qual o prazo médio dos seus investimentos?

Resposta Pontos

---

Menos de 1 ano 0
1--3 anos 2
3--5 anos 4
Mais de 5 anos 5

---

## 15. Seu principal objetivo é:

Resposta Pontos

---

Preservar capital 0
Gerar renda 2
Crescimento moderado 4
Crescimento agressivo 5

---

## 16. Você pretende fazer aportes regulares?

Resposta Pontos

---

Não 0
Ocasionalmente 2
Sim regularmente 5

---

## 17. Como você diversifica seus investimentos?

Resposta Pontos

---

Não diversifico 0
Pouco 2
Diversificação moderada 4
Forte diversificação 5

---

## 18. Qual classe de ativos você prefere?

Resposta Pontos

---

Poupança / Tesouro Selic 0
Renda fixa 2
Fundos / FIIs 4
Ações / ETFs / Cripto 5

---

# Classificação do Perfil

Pontuação total possível: **90 pontos**

Pontuação Perfil

---

0 -- 30 Conservador
31 -- 60 Moderado
61 -- 90 Agressivo

---

# Algoritmo de Classificação

```ts
function calcularPerfil(score: number) {
  if (score <= 30) return "CONSERVADOR";
  if (score <= 60) return "MODERADO";
  return "AGRESSIVO";
}
```

---

# Modelo Recomendado para Robo-Advisors

Separar três scores:

    score_psicologico
    score_capacidade
    score_horizonte

Perfil final:

    perfil_final = min(score_psicologico, score_capacidade)

---

# Estrutura JSON para Uso em Agentes de IA

```json
{
  "questionario": {
    "totalPerguntas": 18,
    "pontuacaoMaxima": 90,
    "classificacao": {
      "conservador": [0, 30],
      "moderado": [31, 60],
      "agressivo": [61, 90]
    }
  }
}
```
