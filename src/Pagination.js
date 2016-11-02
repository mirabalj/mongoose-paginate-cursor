/**
 * Created by david on 9/22/16.
 */
import _debug from 'debug';
import Promise from 'bluebird';

const debug = _debug('mpaginate');

export default function globalSchema(schema, { name } = {}) {

  const paginate = async function paginate({
    sinceId,
    maxId,
    limit = 1,
    select,
    where = {},
    keyID = '_id',
    keyOrder = '_id',
    reverse = false,
    map,
    filter,
  } = {}) {
    const lsThanE = reverse ? '$gte' : '$lte';
    const lsThan = reverse ? '$gt' : '$lt';
    const gsThan = reverse ? '$lt' : '$gt';
    const findObject = where;
    const findCursor = {};
    const sort = {};

    if (sinceId) {
      const objFound = await this.findById(sinceId);
      if(objFound) {
        debug('found on sinceId', objFound);
        // find where _id is greater than the one on sinceId
        findCursor[lsThanE] = objFound[keyOrder];
        findObject[keyOrder] = findCursor;
      }
    }

    if (maxId) {
      const objFound = await this.findById(maxId);
      if(objFound) {
        debug('found on maxId', objFound);
        // find where _id is greater than the one on maxId
        findCursor[gsThan] = objFound[keyOrder];
        findObject[keyOrder] = findCursor;
      }
    }

    sort[keyOrder] = reverse ? 1 : -1;

    if(keyID != keyOrder) {
      sort[keyID] = reverse ? 1 : -1;
    }
    /**
     * find with query and map it
     * @param queryObj
     * @param limitFind
     * @return {*}
     */
    const findWithLimit = async (queryObj, limitFind) => {
      debug('will findWithLimit', { where: queryObj, limit: limitFind, select });
      let query = this.find(queryObj, select)
        .sort(sort);
      if (limitFind) {
        query = query.limit(limitFind);
      }

      const objectsFirstFound = await query.exec();
      let mappedObjects;
      // map the objects if there is a map
      if (map) {
        mappedObjects = await Promise.resolve(objectsFirstFound).map(map);
      } else {
        mappedObjects = objectsFirstFound;
      }
      return mappedObjects;
    };


    let objects = [];
    let limitObjects = limit;
    if (filter) {
      let objToFilter = await findWithLimit(findObject, limit);

      // loop once to apply the filter
      do {
        // filter objects found that has not been filtered
        const objectsFiltered = await Promise.resolve(objToFilter).filter(filter);

        // add filtered objects to final array
        objects = objects.concat(objectsFiltered);

        const lastIndex = objToFilter.length - 1;
        const lastOrderValue = objToFilter[lastIndex][keyOrder];

        // set the limit to get the missing objects filtered
        limitObjects -= objectsFiltered.length;
        debug(`filtered ${limitObjects} element(s)`);
        if (limitObjects <= 0) {
          break;
        }
        // set the cursor to search AFTER the last found
        findCursor[lsThan] = lastOrderValue;
        findObject[keyOrder] = findCursor;


        // get the new objects from the model list
        objToFilter = await findWithLimit(findObject, limitObjects);

        debug(`${objToFilter.length} element(s) to replace with filter`);
        // while the limit has items to get and the found objects to fetch and filter
      } while (limitObjects > 0 && objToFilter.length > 0);
    } else {
      // if there is no filter set objects found
      objects = await findWithLimit(findObject, limit);
    }

    let nextCursor;

    if (objects.length) {
      debug('objects has length', objects.length);
      const lastItem = objects[objects.length - 1];
      const lastOrderFound = lastItem[keyOrder];
      let nextObject;

      const findNextWithSameOrder = where;

      findNextWithSameOrder[keyOrder] = lastOrderFound;
      const findNextCursorID = {};
      findNextCursorID[lsThan] = lastItem[keyID];
      findNextWithSameOrder[keyID] = findNextCursorID;

      debug('find nextCursor with', { where: findNextWithSameOrder, select: keyID});
      nextObject = await this
          .findOne(findNextWithSameOrder, keyID)
          .sort(sort);

      if(!nextObject) {
        const findNextCursorWhere = where;
        const findNextCursor = {};
        findNextCursor[lsThan] = lastOrderFound;
        findNextCursorWhere[keyOrder] = findNextCursor;
        debug('find nextCursor with', { where: findNextCursorWhere, select: keyID});
        nextObject = await this
          .findOne(findNextCursorWhere, keyID)
          .sort(sort);
      } else {
        debug('found cursor with same keyOrder', lastOrderFound)
      }

      debug('found on nextObject', nextObject);
      if (nextObject) {
        nextCursor = nextObject[keyID];
        debug('nextCursor found', nextCursor);
      } else {
        debug('nextCursor no found');
      }
    }

    const objectReturn = {
      objects,
      nextCursor,
    };
    return objectReturn;
  };

  if (name) {
    schema.statics[name] = paginate;
  } else {
    schema.statics.paginate = paginate;
  }
}

