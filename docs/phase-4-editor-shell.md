# Phase 4 editor shell and selection bridge

Status: implemented, 2026-09-28.

The exact revision preview now hosts an external authoring shell without changing the
Story Language or renderer hierarchy. The shell is a fixed sibling of the story root;
the selection marker is a pointer-free fixed overlay. Neither participates in Panel
layout, semantic story reading order, or ScrollTrigger measurements.

Implemented capabilities:

- direct Panel selection in rendered content using stable authored IDs;
- optional selected-Panel context with a visible clear action;
- selection geometry refresh on scroll and resize;
- reduced-motion-aware movement to selected elements;
- immutable revision history with operation/diff summaries;
- restore-as-new-head controls;
- exact revision preview acknowledgement;
- commit locked until that revision is acknowledged;
- conflict/error announcements through an ARIA status region;
- direct navigation back to production;
- responsive fixed editor surface with a chat-style scrolling conversation and
  bottom-positioned prompt controls.

Panel selection is optional; authors may still describe a target in chat. Selection
never invents positional identity and never mutates authored JSON.

The full browser suite confirms that adding the sibling shell does not regress reader
geometry, navigation, reduced motion, Card/Mask animation, or authored reading order.
