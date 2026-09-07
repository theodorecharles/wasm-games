class TestIndex : public FileIndex<uint32_t> {
public:
    TestIndex(const std::string& name, uint8_t version = 31)
        : FileIndex("object index", 0x5844494F, version, std::string(name), "*.dat;*.pob;*.json;*.parkobj",
            {"/OpenRCT2/object", "/save/openrct2/object"}) {}
    std::optional<uint32_t> Create(int32_t, const std::string& path) const override {
        creates++;
        for (const auto& file : world) if (file.path == path) return file.value;
        throw std::runtime_error("unexpected path");
    }
    void Serialise(OpenRCT2::DataSerialiser& ds, const uint32_t& value) const override { ds.Item(value); }
};
std::vector<InputFile> ReadWorld(std::istream& input) {
    size_t size; input >> size;
    std::vector<InputFile> files(size);
    for (auto& file : files) input >> file.path >> file.size >> file.modified >> file.value;
    assert(input.good()); return files;
}
void CheckItems(std::vector<uint32_t> items) {
    std::vector<uint32_t> values;
    for (const auto& file : world) values.push_back(file.value);
    std::sort(items.begin(), items.end()); std::sort(values.begin(), values.end());
    assert(items == values);
}
int main(int argc, char** argv) {
    assert(argc == 5);
    std::ifstream input(argv[1]);
    const std::string index = argv[2], option = argv[4];
    const bool expectRebuild = std::string(argv[3]) == "1";
    assert(!std::filesystem::exists(index));
    world = ReadWorld(input);
    CheckItems(TestIndex(index).LoadOrBuild(1));
    assert(creates == world.size());
    if (option == "corrupt") {
        std::fstream file(index, std::ios::binary | std::ios::in | std::ios::out);
        uint32_t zero = 0; file.write(reinterpret_cast<char*>(&zero), sizeof zero);
    } else if (option == "truncate") std::filesystem::resize_file(index, 1);
    world = ReadWorld(input); creates = 0;
    CheckItems(TestIndex(index, option == "version" ? 32 : 31).LoadOrBuild(option == "language" ? 2 : 1));
    assert(creates == (expectRebuild ? world.size() : 0));
    std::cout << "native index round trip passed: rebuilt=" << expectRebuild << " created=" << creates << '\n';
}
