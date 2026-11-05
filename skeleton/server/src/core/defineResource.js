import mongoose from 'mongoose';
import config from '../../crypt.config.js';
import { ACTIONS } from './permissions.js';
import {
  FIELD_TYPES, RESERVED_FIELDS, KEY_RE, FIELD_NAME_RE, pascalCase, refModelName,
} from './fieldTypes.js';

const TOP_LEVEL = [
  'key', 'label', 'icon', 'titleField', 'fields', 'permissions', 'softDelete', 'statusFlow',
  'due', 'report', 'voice', 'defaultSort', 'hooks', 'extendSchema', 'description',
];
const HOOKS = ['beforeCreate', 'afterCreate', 'beforeUpdate', 'afterUpdate'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrArr = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

/**
 * Pure validation of a Resource Definition (Req 4.3, 4.4, 16.x). Never throws.
 * @param {object} def
 * @param {string[]} roles - configured roles
 * @returns {string[]} error messages, each prefixed with the resource name
 */
export function validateDefinition(def, roles = config.roles) {
  const name = isObj(def) && typeof def.key === 'string' ? def.key : '<unknown>';
  const errors = [];
  const err = (msg) => errors.push(`Resource "${name}": ${msg}`);

  if (!isObj(def)) return ['Resource "<unknown>": definition must be an object'];

  for (const k of Object.keys(def)) if (!TOP_LEVEL.includes(k)) err(`unknown property "${k}"`);

  if (typeof def.key !== 'string' || !KEY_RE.test(def.key)) err('key must be lowercase kebab-case (e.g. "stock-lots")');
  if (typeof def.label !== 'string' || !def.label.trim()) err('label is required');

  // ── fields ────────────────────────────────────────────────────────────────
  const fields = isObj(def.fields) ? def.fields : null;
  if (!fields || Object.keys(fields).length === 0) {
    err('fields must declare at least one field');
  } else {
    for (const [fname, spec] of Object.entries(fields)) {
      if (!FIELD_NAME_RE.test(fname)) { err(`field name "${fname}" is invalid`); continue; }
      if (RESERVED_FIELDS.includes(fname)) { err(`field "${fname}" is reserved`); continue; }
      if (!isObj(spec)) { err(`field "${fname}" must be an object`); continue; }
      const allowed = FIELD_TYPES[spec.type];
      if (!allowed) { err(`field "${fname}" has unknown type "${spec.type}"`); continue; }
      for (const flag of Object.keys(spec)) {
        if (!allowed.includes(flag)) err(`field "${fname}" (${spec.type}) does not support "${flag}"`);
      }
      if (spec.type === 'enum') {
        if (!isStrArr(spec.values) || spec.values.length === 0) err(`enum field "${fname}" needs non-empty string "values"`);
        else if (new Set(spec.values).size !== spec.values.length) err(`enum field "${fname}" has duplicate values`);
        else if (spec.default !== undefined) {
          const defaults = spec.multiple ? spec.default : [spec.default];
          if (!Array.isArray(defaults) || !defaults.every((d) => spec.values.includes(d))) {
            err(`enum field "${fname}" default must be one of its values`);
          }
        }
      }
      if (spec.type === 'ref' && (typeof spec.ref !== 'string' || !spec.ref)) err(`ref field "${fname}" needs a "ref" target`);
      for (const n of ['min', 'max']) {
        if (spec[n] !== undefined && typeof spec[n] !== 'number') err(`field "${fname}" ${n} must be a number`);
      }
      if (typeof spec.min === 'number' && typeof spec.max === 'number' && spec.min > spec.max) {
        err(`field "${fname}" min is greater than max`);
      }
    }
  }
  const fieldOf = (n) => (fields && typeof n === 'string' ? fields[n] : undefined);
  const enumValues = (n) => (fieldOf(n)?.type === 'enum' && !fieldOf(n).multiple ? fieldOf(n).values ?? [] : null);

  if (def.titleField !== undefined && !fieldOf(def.titleField)) err(`titleField "${def.titleField}" is not a declared field`);

  // ── permissions ───────────────────────────────────────────────────────────
  if (!isObj(def.permissions)) {
    err('permissions must be an object of { read, create, update, delete } role arrays');
  } else {
    for (const [action, list] of Object.entries(def.permissions)) {
      if (!ACTIONS.includes(action)) { err(`permissions has unknown action "${action}"`); continue; }
      if (!isStrArr(list)) { err(`permissions.${action} must be an array of role names`); continue; }
      for (const role of list) if (!roles.includes(role)) err(`permissions.${action} names unknown role "${role}"`);
    }
  }

  // ── statusFlow ────────────────────────────────────────────────────────────
  if (def.statusFlow !== undefined) {
    const sf = def.statusFlow;
    const values = isObj(sf) ? enumValues(sf.field) : null;
    if (!values) err(`statusFlow.field "${sf?.field}" must be a single-value enum field`);
    else {
      if (!isObj(sf.transitions)) err('statusFlow.transitions must be an object');
      else {
        for (const [from, tos] of Object.entries(sf.transitions)) {
          if (!values.includes(from)) err(`statusFlow transition source "${from}" is not a value of "${sf.field}"`);
          if (!isStrArr(tos)) { err(`statusFlow.transitions.${from} must be an array`); continue; }
          for (const to of tos) if (!values.includes(to)) err(`statusFlow transition target "${to}" is not a value of "${sf.field}"`);
        }
      }
      if (sf.workflowOnly !== undefined) {
        if (!isStrArr(sf.workflowOnly)) err('statusFlow.workflowOnly must be an array');
        else for (const v of sf.workflowOnly) if (!values.includes(v)) err(`statusFlow.workflowOnly value "${v}" is not a value of "${sf.field}"`);
      }
    }
  }

  // ── due ───────────────────────────────────────────────────────────────────
  if (def.due !== undefined) {
    const d = def.due;
    if (!isObj(d)) err('due must be an object');
    else {
      if (fieldOf(d.field)?.type !== 'date') err(`due.field "${d.field}" must be a date field`);
      const values = enumValues(d.status);
      if (!values) err(`due.status "${d.status}" must be a single-value enum field`);
      else {
        if (!isStrArr(d.from) || d.from.length === 0) err('due.from must be a non-empty array');
        else for (const v of d.from) if (!values.includes(v)) err(`due.from value "${v}" is not a value of "${d.status}"`);
        if (!values.includes(d.to)) err(`due.to value "${d.to}" is not a value of "${d.status}"`);
      }
    }
  }

  // ── softDelete ────────────────────────────────────────────────────────────
  if (def.softDelete !== undefined) {
    const s = def.softDelete;
    if (!isObj(s)) err('softDelete must be an object');
    else {
      const values = enumValues(s.field);
      if (!values) err(`softDelete.field "${s.field}" must be a single-value enum field`);
      else if (!values.includes(s.value)) err(`softDelete.value "${s.value}" is not a value of "${s.field}"`);
      if (typeof s.at !== 'string' || !FIELD_NAME_RE.test(s.at)) err('softDelete.at must be a field name');
      else if (fieldOf(s.at)) err(`softDelete.at "${s.at}" collides with a declared field`);
    }
  }

  // ── misc ──────────────────────────────────────────────────────────────────
  if (def.report !== undefined) {
    if (!isObj(def.report) || (def.report.columns !== undefined && !isStrArr(def.report.columns))) err('report.columns must be an array');
    else for (const c of def.report.columns ?? []) if (!fieldOf(c)) err(`report column "${c}" is not a declared field`);
  }
  if (def.voice !== undefined && (!isObj(def.voice) || (def.voice.synonyms !== undefined && !isStrArr(def.voice.synonyms)))) {
    err('voice.synonyms must be an array of strings');
  }
  if (def.defaultSort !== undefined) {
    const f = typeof def.defaultSort === 'string' ? def.defaultSort.replace(/^-/, '') : null;
    if (!f || (!fieldOf(f) && !['createdAt', 'updatedAt'].includes(f))) err(`defaultSort "${def.defaultSort}" is not a sortable field`);
  }
  if (def.hooks !== undefined) {
    if (!isObj(def.hooks)) err('hooks must be an object');
    else for (const [h, fn] of Object.entries(def.hooks)) {
      if (!HOOKS.includes(h)) err(`unknown hook "${h}"`);
      else if (typeof fn !== 'function') err(`hook "${h}" must be a function`);
    }
  }
  if (def.extendSchema !== undefined && typeof def.extendSchema !== 'function') err('extendSchema must be a function');

  return errors;
}

/**
 * Maps Field Specs to a Mongoose schema (Req 4.6, 4.7, 16.2, 16.8).
 * @param {object} def - a validated definition
 * @returns {mongoose.Schema}
 */
export function buildSchema(def) {
  const paths = {};
  for (const [name, f] of Object.entries(def.fields)) {
    let p;
    switch (f.type) {
      case 'string':
        p = { type: String, trim: true };
        if (f.min !== undefined) p.minlength = f.min;
        if (f.max !== undefined) p.maxlength = f.max;
        if (f.unique) { p.unique = true; p.sparse = !f.required; }
        break;
      case 'text':
        p = { type: String };
        if (f.max !== undefined) p.maxlength = f.max;
        break;
      case 'number':
        p = { type: Number };
        if (f.min !== undefined) p.min = f.min;
        if (f.max !== undefined) p.max = f.max;
        break;
      case 'boolean':
        p = { type: Boolean };
        break;
      case 'date':
        p = { type: Date };
        break;
      case 'enum':
        p = f.multiple
          ? { type: [{ type: String, enum: f.values }], default: undefined }
          : { type: String, enum: f.values };
        break;
      case 'ref':
        p = { type: mongoose.Schema.Types.ObjectId, ref: refModelName(f.ref) };
        break;
      default:
        throw new Error(`Unsupported field type ${f.type}`);
    }
    if (f.required) p.required = [true, `${f.label ?? name} is required`];
    if (f.default !== undefined) p.default = f.default;
    if (f.type === 'enum' && f.multiple && f.default === undefined) p.default = [];
    if (f.secret) p.select = false;
    if (f.filter && f.type !== 'enum') p.index = true;
    paths[name] = p;
  }

  paths.createdBy = { type: mongoose.Schema.Types.ObjectId, ref: 'User' };
  if (def.softDelete) paths[def.softDelete.at] = { type: Date };

  const schema = new mongoose.Schema(paths, { timestamps: true, strict: true });
  for (const [name, f] of Object.entries(def.fields)) {
    if (f.filter && f.type === 'enum') schema.index({ [name]: 1 });
  }
  if (typeof def.extendSchema === 'function') def.extendSchema(schema);
  return schema;
}

/**
 * Validates a definition and builds its model.
 * @param {object} def
 * @param {{ roles?: string[] }} [opts]
 * @returns {Readonly<{ key: string, def: object, model: mongoose.Model, modelName: string }>}
 * @throws {Error} listing every validation problem
 */
export function defineResource(def, { roles = config.roles } = {}) {
  const errors = validateDefinition(def, roles);
  if (errors.length) {
    const e = new Error(`Invalid resource definition:\n  - ${errors.join('\n  - ')}`);
    e.errors = errors;
    throw e;
  }
  const modelName = pascalCase(def.key);
  const model = mongoose.models[modelName] ?? mongoose.model(modelName, buildSchema(def));
  return Object.freeze({ key: def.key, def: Object.freeze({ ...def }), model, modelName });
}
