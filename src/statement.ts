export interface StatementParams {
  ageCheck?: boolean;
  countryCheck?: boolean;
  minimumAge?: number;
  maximumAge?: number;
  allowedCountries?: string[];
  disallowedCountries?: string[];
}

interface AttributeInRangeStatement {
  type: 'AttributeInRange';
  attributeTag: 'dob';
  lower?: string;
  upper?: string;
}

interface AttributeInSetStatement {
  type: 'AttributeInSet' | 'AttributeNotInSet';
  attributeTag: 'nationality';
  set: string[];
}

export type Statement = AttributeInRangeStatement | AttributeInSetStatement;

const formatDate = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

export const buildStatements = (params: StatementParams): Statement[] => {
  const {
    ageCheck = false,
    countryCheck = false,
    minimumAge = 0,
    maximumAge = 0,
    allowedCountries = [],
    disallowedCountries = [],
  } = params;

  const statements: Statement[] = [];

  if (countryCheck) {
    if (allowedCountries.length > 0) {
      statements.push({
        type: 'AttributeInSet',
        attributeTag: 'nationality',
        set: allowedCountries,
      });
    } else if (disallowedCountries.length > 0) {
      statements.push({
        type: 'AttributeNotInSet',
        attributeTag: 'nationality',
        set: disallowedCountries,
      });
    }
  }

  if (ageCheck) {
    const today = new Date();
    const upperObj = new Date(today);
    upperObj.setFullYear(upperObj.getFullYear() - minimumAge);

    const statement: AttributeInRangeStatement = {
      type: 'AttributeInRange',
      attributeTag: 'dob',
      upper: formatDate(upperObj),
    };

    if (maximumAge > 0) {
      const lowerObj = new Date(today);
      lowerObj.setFullYear(lowerObj.getFullYear() - maximumAge);
      statement.lower = formatDate(lowerObj);
    }

    statements.push(statement);
  }

  if (statements.length === 0) {
    throw new Error(
      'No statements built — at least one of ageCheck or countryCheck must be set with valid params'
    );
  }

  return statements;
};
