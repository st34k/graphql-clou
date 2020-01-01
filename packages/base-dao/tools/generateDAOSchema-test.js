const path = require('path');
const fs = require('fs-extra');
const generateDAOSchema = require('./generateDAOSchema');

const cwd = path.resolve(__dirname);

describe('generateDAOSchema', () => {
  test('generate files should be match to snapshots', async () => {
    await generateDAOSchema({
      dataModelPath: './fixtures/datamodel.graphql',
      generatedFolderPath: 'generated',
      cwd
    });
    const fileNames = fs.readdirSync(path.resolve(cwd, './generated'));
    fileNames.forEach(fileName => {
      const filePath = path.resolve(path.resolve(cwd, './generated', fileName));
      const file = fs.readFileSync(filePath, 'utf8');
      expect(file).toMatchSnapshot();
    });
  });
});
