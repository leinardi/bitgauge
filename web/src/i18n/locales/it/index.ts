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

import a11y from './a11y.json'
import about from './about.json'
import app from './app.json'
import errors from './errors.json'
import history from './history.json'
import notices from './notices.json'
import result from './result.json'
import settings from './settings.json'
import share from './share.json'
import test from './test.json'

export default { ...app, ...test, ...notices, ...errors, ...history, ...settings, ...about, ...result, ...share, ...a11y }
