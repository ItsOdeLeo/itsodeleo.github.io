---
title: "If LLMs Can Decide Without Fine-Tuning, Do We Still Need Models Like Jev?"
date: 2026-10-08 18:38:00
excerpt: "If the options have meaning, could a language model's learned probability distribution already contain the ability to choose? I tried reading decisions directly from existing models before deciding whether to add a specialist."
description: "Can LLMs make decisions without extra fine-tuning? Local tests of Qwen, Gemma, Jeff, and Laya explore whether a workflow needs a dedicated decision model."
lang: en
translation_key: local-decision-workflow
---

Often, we ask a model to write a response just to extract a decision from it.

[Jev, released by TypeSafe in September](https://typesafe.ai/blog/introducing-system-one-models-and-jev), is built around this need: give it context and a question, and get a choice, score, or probability directly. It treats decisions as a task in their own right, with attention to how trustworthy the probabilities are and how to handle multiple decisions efficiently over the same context.

As I learned how it works and tried implementing the idea myself, I had a question: does this kind of judgment really require additional fine-tuning?

A language model already learns the probabilities of different text continuations given a context. My intuition was that, if the options are expressed in words and have meaning, the model should already lean toward some answers over others after reading the question and the options. A model trained well enough might already be able to use its learned language distribution to distinguish which option fits the question better.

**Could we read that preference directly from the distribution and use it to choose, without another round of fine-tuning for decisions?**

This was the idea I most wanted to test: perhaps the ability to make the judgment was already in the model. We usually ask it to generate the answer as text, but perhaps we could read the judgment directly.

I also had another suspicion about specially trained models such as Jeff and Laya: could they be adapting too closely to the kinds of tasks they were fine-tuned on, with substantial overfitting? Doing well on familiar tasks is one thing. What happens when I give them my questions?

So, for the main test, I used a set of questions I cared about, rather than reusing the task sets those models were fine-tuned for. My first aim was to see whether an existing model's probability preferences could support useful decisions directly. I also wanted to see how much of the specialists' advantage would carry over to different tasks.

## Reading the judgment already in the model

I used existing Qwen and Gemma models, without further decision fine-tuning or a newly trained classification head.

The method was straightforward: let the model read the context, question, and available answers, then take the scores for the answer labels at the final input position—the logits. Use those scores to choose, without having the model generate the answer token by token.

This still requires a forward pass through the full model; input prefixes can be reused where caching allows. What it skips is the subsequent text generation. These scores let me compare answers, but they cannot be interpreted directly as the probability that a decision is correct.

What I wanted to find out was: **without extra fine-tuning, could the model's existing probability preferences become useful judgments on my own tasks?**

## What happens with a different set of questions?

I compared these two direct-scoring versions with local decision models including Jeff and Laya, using the same set of questions I had constructed. Here are the main results, rounded for readability.

Jeff is a separate project. I did not directly test TypeSafe's Jev in this experiment.

<div class="table-scroll" role="region" aria-label="Local decision model results" tabindex="0">

| Model / configuration | Accuracy | Median warm request time |
|---|---:|---:|
| Jeff 0.8B v1.1 | 60% | 128 ms |
| Jeff 2B v1.1 | 65% | 295 ms |
| OpenDecider small (8-bit) | 77% | 707 ms |
| CLM 8B (native input) | 17% | 570 ms |
| CLM 8B (JSON input) | 17% | 664 ms |
| Laya multilingual | 37% | 17 ms |
| Laya English | 35% | 58 ms |
| Laya Typed Decisions | 51% | 65 ms |
| Qwen 3.5 9B (direct scoring, no extra fine-tuning) | 61% | 217 ms |
| Gemma 4 26B-A4B (direct scoring, no extra fine-tuning) | 75% | 259 ms |

</div>

These tests ran on an M2 Max with 64 GiB of memory. Accuracy is based on 300 fixed test inputs; timings cover valid calls across repeated runs, excluding model loading and context preparation. Inputs rejected by Laya English because of their length still count toward its accuracy denominator. All of CLM's correct results came from fallback decisions. Model sizes, quantization, and input formats differ, so this is not a controlled comparison of fine-tuning effects.

What mattered most to me was this: **small specialist models can be very fast, but useful judgment does not necessarily require additional training.** Gemma's direct scoring came close to the highest accuracy among the configurations in this test. It had not solved every problem, but it was enough to make me seriously consider using the model I already had.

For reference, I also tested the public Typed Decisions dataset. Laya Typed Decisions scored about 77% there, compared with about 51% on my questions. That gap strengthened my suspicion about task overfitting. But the tasks, languages, and input conditions all changed together, so this comparison alone cannot establish overfitting as the cause. The question I cared about was whether performance on familiar tasks would carry over to the tasks I actually needed.

Looking more closely, some models could select an answer but struggled to recognize when they should not make a direct choice. My two general-purpose baselines had this problem too. That matters more than continuing to compare a few percentage points: a workflow needs more than a model that can pick an answer.

## The same model can take a faster path

I also compared direct scoring with a full generation pipeline using the same Gemma weights. This was a separate offline test, so its results should not be combined with the first table.

<div class="table-scroll" role="region" aria-label="Two ways of using the same Gemma model" tabindex="0">

| Same Gemma, two ways of calling it | Accuracy | Median warm request time |
|---|---:|---:|
| Read answer scores directly | 75% | 186 ms |
| Full generation pipeline | 37% | 2,166 ms |

</div>

Both paths ran each of 53 test inputs twice, with failures included in the timings. The full generation pipeline also includes parsing, validation, and repair when needed, while the runtimes and caching differ between the two paths. This experiment therefore changes more than whether text is generated. Context preparation for direct scoring is timed separately and takes about five seconds on a cache miss.

What interested me about this comparison was that the same model's ability could be accessed in different ways. Getting a judgment need not always involve the full generation pipeline.

Direct scoring still has a limited scope. In this test, it did not handle requests that could not be expressed through the available options; the full generation pipeline was not reliable on those requests either. The table gives me a reason to keep a constrained decision path, but it does not show that it can replace all generation capabilities.

## Is a faster decision worth another model?

If the tasks are stable and the workflow only needs to make frequent decisions, a small, fast specialist is certainly appealing.

But I am more interested in a different situation: a local workflow that already needs a model to write replies.

An incoming sentence might call for a decision or a written answer. The system has to distinguish between them before choosing a path. Splitting that work between two models brings routing, switching, fallback, and maintenance into the picture. If both models run locally, whether they both need to stay in memory matters too.

If the existing model has to be running anyway and can already make useful judgments, keeping decisions and replies in that model may be a better fit, even if individual decisions take longer.

Jev itself has [a design for using decisions to route requests](https://docs.typesafe.ai/patterns/intent-routing). The question is how much that extra layer benefits a particular workflow once its costs are included. A single model also needs a way to distinguish when to decide and when to reply; using one model does not automatically solve routing.

These experiments have not compared complete workflows using one model versus two, but they have informed the choice I have made for now.

**So far, I have not added a separate, dedicated decision model to my workflow.** I changed how I call the existing model: when a choice is needed, I read the answer-label logits directly, allowing it to return a decision too.

---

During the time I was writing this post, a paper titled [*LLM-as-Jev: LLMs Are Already Jev-Style Decision Models—When and How to Fine-Tune Them*](https://arxiv.org/html/2610.02076v2) was also released. One of its main findings is similar to what I observed: capable existing language models can make useful decisions directly, even without additional fine-tuning.
