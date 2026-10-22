/*
 * This file is part of BitGauge.
 *
 * Copyright (c) 2026 Roberto Leinardi
 *
 * BitGauge is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * BitGauge is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with BitGauge.  If not, see <http://www.gnu.org/licenses/>.
 */

import { type Component, markRaw } from 'vue'
import { toast } from 'vue-sonner'

import AppToast from '@/components/feedback/AppToast.vue'

// Every toast of the app (ui/screens.md section 8) is the kit's Toast inside vue-sonner, which
// places and times it; vue-sonner's own toast is never drawn.

/** An undo toast's time (ui/screens.md section 8, frontend.md section 5). */
const UNDO_MS = 8000
/** The kit's toast time for a confirmation (ResultDetail.jsx). */
const DONE_MS = 4000

export type ToastTone = 'ok' | 'info' | 'warn' | 'danger'

export interface Notice {
  tone: ToastTone
  icon?: Component
  title: string
  message?: string
  /** Undo, for UNDO_MS, with the time counted down in the message line when `countdown` is set. */
  undo?: { label: string; onClick: () => void; countdown?: boolean }
}

export function notify({ undo, icon, ...rest }: Notice): void {
  const props = {
    ...rest,
    ...(icon === undefined ? {} : { icon: markRaw(icon) }),
    ...(undo === undefined ? {} : { action: { label: undo.label, onClick: undo.onClick }, ...(undo.countdown === true ? { countdownS: UNDO_MS / 1000 } : {}) }),
  }
  toast.custom(markRaw(AppToast), { duration: undo === undefined ? DONE_MS : UNDO_MS, componentProps: props })
}
