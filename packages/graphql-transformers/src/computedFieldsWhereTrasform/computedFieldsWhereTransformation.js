const { replace, cloneDeep, lowerFirst } = require('lodash');
const { forEach, map } = require('async');
const { getOpenCrudIntrospection, introspectionUtils } = require('@venncity/opencrud-schema-provider');

const openCrudIntrospection = getOpenCrudIntrospection();

async function transformComputedFieldsWhereArguments({
  originalWhere,
  whereInputName,
  computedWhereArgumentsTransformation,
  context,
  initialCall = true
}) {
  let transformedWhere = cloneIfRequired(initialCall, originalWhere);
  if (originalWhere) {
    if (computedWhereArgumentsTransformation) {
      transformedWhere = await replaceTopLevelWhereFields(computedWhereArgumentsTransformation, transformedWhere, whereInputName, context);
      await replaceBooleanOperators(transformedWhere, whereInputName, computedWhereArgumentsTransformation, context);
    }
    const whereInputObjectFields = getWhereInputObjectFields(whereInputName);
    const entityType = getEntityTypeFromWhereInput(whereInputName);
    await replaceWhereNestedObjectFields(whereInputObjectFields, transformedWhere, entityType, context);
  }
  return transformedWhere;
}

function cloneIfRequired(initialCall, originalWhere) {
  // We don't want to mutate the original where as it may serve multiple queries on a single request!
  //
  // However, for each where, we *do* want to keep the same instance between recursive calls of transformComputedFieldsWhereArguments,
  //  as it needs to replace and delete fields on the original where.
  return initialCall ? cloneDeep(originalWhere) : originalWhere;
}

async function replaceTopLevelWhereFields(computedWhereArgumentsTransformation, transformedWhere, whereInputName, context) {
  await replaceBooleanOperators(transformedWhere, whereInputName, computedWhereArgumentsTransformation, context);
  await forEach(computedWhereArgumentsTransformation, async originalWhereArgumentName => {
    const transformationFunction = computedWhereArgumentsTransformation[originalWhereArgumentName];
    const originalWhereValue = transformedWhere[originalWhereArgumentName];
    if (originalWhereValue !== undefined) {
      const transformedWhereArgument = await transformationFunction(originalWhereValue);
      delete transformedWhere[originalWhereArgumentName];
      transformedWhere = {
        ...transformedWhere,
        ...transformedWhereArgument
      };
    }
  });
  return transformedWhere;
}

async function replaceBooleanOperators(transformedWhere, whereInputName, computedWhereArgumentsTransformation, context) {
  const booleanOperators = ['AND', 'OR', 'NOT'];
  await forEach(booleanOperators, async operator => {
    if (transformedWhere[operator]) {
      transformedWhere[operator] = await map(transformedWhere[operator], async whereElementWithinBooleanOperator => {
        const transformedWhereArg = await transformComputedFieldsWhereArguments({
          originalWhere: whereElementWithinBooleanOperator,
          whereInputName,
          computedWhereArgumentsTransformation,
          context,
          initialCall: false
        });
        return transformedWhereArg;
      });
    }
  });
}

function convertWhereArgumentToFieldName(objectFieldName) {
  const listFieldWhereModifiers = /(_none$|_some$|_every$)/;
  return replace(objectFieldName, listFieldWhereModifiers, '');
}

async function replaceWhereNestedObjectFields(whereInputObjectFields, transformedWhere, entityType, context) {
  await forEach(whereInputObjectFields, async whereInputObjectField => {
    const objectFieldInWhere = whereInputObjectField.name;
    if (transformedWhere[objectFieldInWhere]) {
      const objectFieldNameWherePart = transformedWhere[objectFieldInWhere];
      const fieldName = convertWhereArgumentToFieldName(objectFieldInWhere);
      if (isInputObject(whereInputObjectField)) {
        const childField = introspectionUtils.getChildFields(entityType, openCrudIntrospection).find(field => field.name === fieldName);
        const nestedObjectDAO = context.DAOs[`${lowerFirst(introspectionUtils.getFieldType(childField))}DAO`];
        transformedWhere[objectFieldInWhere] = await transformComputedFieldsWhereArguments({
          originalWhere: objectFieldNameWherePart,
          whereInputName: whereInputObjectField.type.name,
          computedWhereArgumentsTransformation: nestedObjectDAO.computedWhereArgumentsTransformation,
          context,
          initialCall: false
        });
      }
    }
  });
}

function isInputObject(inputField) {
  return inputField.type.kind === 'INPUT_OBJECT';
}

function getWhereInputObjectFields(whereInputName) {
  return openCrudIntrospection.types.find(type => type.name === whereInputName).inputFields.filter(inputField => isInputObject(inputField));
}

function getEntityTypeFromWhereInput(whereInputName) {
  return introspectionUtils.findTypeInIntrospection(openCrudIntrospection, whereInputName.replace('WhereInput', ''));
}

module.exports = {
  transformComputedFieldsWhereArguments
};
